#!/usr/bin/env bash
# Daily Postgres dump (custom format), run by tallybiz-backup.timer.
# Keeps the newest $BACKUP_KEEP dumps. Restore steps: deploy/README.md.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

dest="${BACKUP_DIR:-./backups}"
keep="${BACKUP_KEEP:-14}"
mkdir -p "$dest"
out="$dest/tallybiz_$(date -u +%Y%m%dT%H%M%SZ).dump"

# Write to a temp name first so a failed dump never looks like a good one.
docker compose exec -T tallybiz-db pg_dump -U tallybiz -d tallybiz -Fc > "$out.part"
mv "$out.part" "$out"

ls -1t "$dest"/tallybiz_*.dump | tail -n +"$((keep + 1))" | xargs -r rm -f
echo "backup: $out (keeping $keep)"
