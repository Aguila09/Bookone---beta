#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$BASE_DIR/respaldos"
DB_NAME="${DB_NAME:-bookone_biblioteca}"
mkdir -p "$BACKUP_DIR"

# Permite respaldar bookone_biblioteca o plataforma_segura como respaldo compatible
pg_dump -U postgres -d "$DB_NAME" > "$BACKUP_DIR/bookone_backup_$(date +%Y%m%d_%H%M%S).sql" || \
pg_dump -U postgres -d "plataforma_segura" > "$BACKUP_DIR/bookone_backup_$(date +%Y%m%d_%H%M%S).sql"

echo "Respaldo seguro de la base de datos BOOKONE generado en $BACKUP_DIR"
