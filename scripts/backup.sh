#!/usr/bin/env bash
# Backup harian Postgres (M7). Jalankan via cron di VPS, contoh:
#   0 2 * * * /path/ke/repo/scripts/backup.sh >> /var/log/saleskit-backup.log 2>&1
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/saleskit-$STAMP.sql.gz"

echo "[$(date -Is)] Backup mulai -> $FILE"
docker compose -f "$COMPOSE_FILE" exec -T db \
  pg_dump -U saleskit --clean --if-exists saleskit | gzip > "$FILE"

# Verifikasi minimal: file tidak kosong dan gzip valid
gzip -t "$FILE"
[ -s "$FILE" ] || { echo "Backup kosong!"; exit 1; }

# Rotasi: hapus backup lebih tua dari KEEP_DAYS hari
find "$BACKUP_DIR" -name "saleskit-*.sql.gz" -mtime "+$KEEP_DAYS" -delete

echo "[$(date -Is)] Backup selesai ($(du -h "$FILE" | cut -f1))"
