# Deploying TallyBIZ

Push to `main` → GitHub Actions builds `tallybiz-api` + `tallybiz-web` (arm64),
checks for missing migrations, pushes to GHCR → the server's
`tallybiz-pull.timer` (every 5 min) pulls them and recreates changed containers.
The API runs `migrate` on every start. Nothing to do on the server per release.

CI refuses to push images if models changed without a migration: run
`python manage.py makemigrations` and commit the files under `*/migrations/`.

## How production differs from local dev

App code is untouched; local `runserver` / `npm run dev` work as before.
Production overrides live only in deploy files:
- `deploy/prod_settings.py`: DEBUG off, secret key, hosts and database from env.
- `Dockerfile`: rewrites the hardcoded `http://127.0.0.1:8000/api` to `/api`,
  builds with `vite build` (no `tsc` gate, so type errors don't block deploys).

## One-time server setup

Needs Docker and a reverse proxy on ports 80/443 that routes
`TALLYBIZ_ADDRESS` to `tallybiz-web:8080` on the Docker network `EDGE_NETWORK`.

```bash
sudo git clone git@github.com:YashMPatel/TallyBIZ.git /opt/tallybiz   # SSH key
sudo chown -R $USER /opt/tallybiz && cd /opt/tallybiz/deploy
cp .env.example .env && chmod 600 .env    # fill it in
sudo cp tallybiz-*.service tallybiz-*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tallybiz-pull.timer tallybiz-backup.timer
```

If the GHCR packages are private, the server needs `docker login ghcr.io`
with a token that has `read:packages`. Making them public avoids that.

## Operations (from /opt/tallybiz/deploy)

```bash
sudo systemctl start tallybiz-pull.service        # deploy now
docker compose logs -f tallybiz-api                # logs
docker compose exec tallybiz-api python manage.py createsuperuser
# Roll back: set TALLYBIZ_IMAGE_TAG=<commit sha> in .env, then deploy now.
```

## Backups and restore

`tallybiz-backup.timer` writes a daily `pg_dump` to `deploy/backups/`
(newest 14 kept). They live on the same server: copy them off-host too.

Restore a dump (also how to import an existing database once):

```bash
# make the dump: pg_dump -U postgres -d tallybiz_db -Fc --no-owner -f tallybiz.dump
docker compose stop tallybiz-api
docker compose exec -T tallybiz-db dropdb -U tallybiz tallybiz
docker compose exec -T tallybiz-db createdb -U tallybiz tallybiz
docker compose exec -T tallybiz-db pg_restore -U tallybiz -d tallybiz --no-owner --no-privileges < tallybiz.dump
docker compose up -d tallybiz-api                  # migrate applies anything newer
```
