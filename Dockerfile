# syntax=docker/dockerfile:1
# Two images from one file:
#   --target api  Django REST API (gunicorn), runs migrations on start
#   --target web  nginx: Vite build + Django admin static, proxies /api + /admin to api
# Deployed by deploy/docker-compose.yml; only web is exposed to the outside proxy.

# Static build output is arch-independent: always build on the runner's native arch.
FROM --platform=$BUILDPLATFORM node:22-alpine AS web-build
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
# The app hardcodes its dev API URL; point it at same-origin /api for production.
RUN grep -rl 'http://127.0.0.1:8000/api' src | xargs -r sed -i 's|http://127.0.0.1:8000/api|/api|g'
# ponytail: vite build skips `tsc -b`, so type errors don't block deploys; use `npm run build` to gate on types.
RUN npx vite build

FROM python:3.13-slim AS api
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DJANGO_SETTINGS_MODULE=deploy.prod_settings
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN DJANGO_SECRET_KEY=collectstatic-only python manage.py collectstatic --noinput
USER 65534
EXPOSE 8000
# ponytail: migrate on every start is fine for one replica; move to a one-off job if scaled out.
CMD ["sh", "-c", "python manage.py migrate --noinput && exec gunicorn backend.wsgi -b 0.0.0.0:8000 -w 3 --no-control-socket --access-logfile -"]

FROM nginxinc/nginx-unprivileged:1.29-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /src/dist /usr/share/nginx/html
COPY --from=api /app/staticfiles /usr/share/nginx/html/static
