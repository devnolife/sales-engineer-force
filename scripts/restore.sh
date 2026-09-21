#!/usr/bin/env bash
# Restore backup Postgres (M7). PERHATIAN: menimpa database saat ini!
# Pemakaian: scripts/restore.sh backups/saleskit-YYYYmmdd-HHMMSS.sql.gz
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
FILE="${1:?Pemakaian: restore.sh <file-backup.sql.gz>}"

[ -f "$FILE" ] || { echo "File tidak ditemukan: $FILE"; exit 1; }
gzip -t "$FILE"

read -r -p "Menimpa database 'saleskit' dengan $FILE. Lanjut? (ketik YA) " CONFIRM
[ "$CONFIRM" = "YA" ] || { echo "Dibatalkan."; exit 1; }

echo "[$(date -Is)] Restore mulai dari $FILE"
gunzip -c "$FILE" | docker compose -f "$COMPOSE_FILE" exec -T db \
  psql -U saleskit -d saleskit --set ON_ERROR_STOP=on

echo "[$(date -Is)] Restore selesai. Verifikasi manual: hitung jumlah quotation."
