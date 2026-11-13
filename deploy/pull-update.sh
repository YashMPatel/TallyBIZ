#!/usr/bin/env bash
# Pull-based CD, run every few minutes by tallybiz-pull.timer:
# fast-forward this repo (deploy config changes go live too), pull the images
# .env points at, and recreate only containers whose image or config changed.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

git pull --ff-only --quiet
docker compose pull --quiet
docker compose up -d --remove-orphans
docker image prune -f >/dev/null

if [ -n "$(docker compose ps --status restarting --quiet)" ]; then
  echo "crash-looping: $(docker compose ps --status restarting --format '{{.Service}}')" >&2
  exit 1
fi

ping="$(sed -n 's/^DEPLOY_PING_URL=//p' .env)"
[ -z "$ping" ] || curl -fsS -m 10 --retry 3 -o /dev/null "$ping"
