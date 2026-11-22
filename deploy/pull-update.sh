#!/usr/bin/env bash
# Pull-based CD, run every few minutes by tallybiz-pull.timer:
# fast-forward this repo (deploy config changes go live too), pull the images
# .env points at, and recreate only containers whose image or config changed.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

# Sync deploy config from git. A force-push upstream (e.g. history rewrite) breaks fast-forward;
# follow it only when this clone holds no content upstream lacks, so local work is never discarded.
sync_repo() {
  git fetch --quiet
  git merge --ff-only --quiet '@{u}' 2>/dev/null && return
  if git log --format=%T '@{u}' | grep -qx "$(git rev-parse 'HEAD^{tree}')"; then
    git reset --keep --quiet '@{u}' && echo "repo: followed rewritten upstream history" && return
  fi
  echo "repo diverged from upstream with local-only changes; resolve by hand. Deploying images anyway." >&2
  return 1
}
sync_ok=1
sync_repo || sync_ok=0

# Git trouble must never block image deploys. Retry once: containerd occasionally fails with "lease does not exist".
docker compose pull --quiet || { sleep 15; docker compose pull --quiet; }
docker compose up -d --remove-orphans
docker image prune -f >/dev/null

if [ -n "$(docker compose ps --status restarting --quiet)" ]; then
  echo "crash-looping: $(docker compose ps --status restarting --format '{{.Service}}')" >&2
  exit 1
fi

[ "$sync_ok" = 1 ] || exit 1  # images are live; still fail the unit so the divergence shows up

ping="$(sed -n 's/^DEPLOY_PING_URL=//p' .env)"
[ -z "$ping" ] || curl -fsS -m 10 --retry 3 -o /dev/null "$ping"
