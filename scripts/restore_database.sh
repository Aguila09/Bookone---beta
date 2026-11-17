#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${1:-}"
DB_NAME="${DB_NAME:-bookone_biblioteca}"

if [[ -z "$BACKUP_FILE" ]]; then
  echo "Uso: $0 <archivo_backup.sql>"
  exit 1
fi

psql -U postgres -d "$DB_NAME" < "$BACKUP_FILE" || \
psql -U postgres -d "plataforma_segura" < "$BACKUP_FILE"

echo "Restauración finalizada en BOOKONE desde $BACKUP_FILE"
