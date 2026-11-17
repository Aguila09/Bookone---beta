# Directorio de Respaldos y Recuperación — BOOKONE

Este directorio almacena las copias de seguridad críticas de la plataforma **BOOKONE**, garantizando el pilar de **Disponibilidad** y cumpliendo con los requerimientos de respaldo y recuperación ante desastres (Punto 17 y Punto 20 del proyecto).

---

## Contenido del Directorio

En esta carpeta se resguardan dos tipos de artefactos de recuperación:

1. **Volcados de Base de Datos (`*.sql` / `*.dump`):**
   * Generados mediante `scripts/backup_database.sh`.
   * Contienen el esquema completo y los registros persistidos de `plataforma_segura` (`users`, `products`, `orders`, `order_items`, `payments`, `downloads` y `security_events`).
2. **Empaquetado de Activos Digitales y Criptográficos (`bookone_archivos_*.tar.gz`):**
   * Contiene las obras digitales originales (`productos/`), la Autoridad Certificadora local y certificados públicos (`certificados/`), y las claves públicas de verificación Ed25519 (`claves_publicas/`).

> **Nota de Seguridad:** Por política de confidencialidad y gestión de secretos, **ningún respaldo almacenado en un repositorio público debe contener claves privadas** (`*.key`, `*.pem` privados) ni variables de entorno con secretos de producción (`.env`).

---

## Procedimiento de Generación de Respaldos

Para generar un respaldo completo desde el servidor central (**CachyOS**):

### 1. Respaldo de la Base de Datos PostgreSQL
```bash
cd ~/BOOKONE
./scripts/backup_database.sh
```

### 2. Respaldo de Archivos Digitales y Certificados Públicos
```bash
tar -czf ~/BOOKONE/respaldos/bookone_archivos_$(date +%Y%m%d_%H%M%S).tar.gz \
  --exclude='*.key' \
  --exclude='*private*' \
  -C ~/BOOKONE productos certificados claves_publicas
```

### 3. Verificación de Integridad del Respaldo
Antes de dar por válido un respaldo, se recomienda calcular y registrar su suma de verificación **SHA-256**:
```bash
sha256sum ~/BOOKONE/respaldos/* > ~/BOOKONE/respaldos/SHA256SUMS.txt
cat ~/BOOKONE/respaldos/SHA256SUMS.txt
```

---

## Procedimiento de Restauración (Recuperación ante Desastres)

### 1. Restaurar la Base de Datos
* **En la base de datos principal (`plataforma_segura`):**
  ```bash
  cd ~/BOOKONE
  ./scripts/restore_database.sh ~/BOOKONE/respaldos/<ARCHIVO_RESPALDO>.sql
  ```
* **En una base de datos aislada de validación (sin afectar producción):**
  ```bash
  sudo -u postgres psql -c "DROP DATABASE IF EXISTS plataforma_segura_test;"
  sudo -u postgres psql -c "CREATE DATABASE plataforma_segura_test;"
  sudo -u postgres psql -d plataforma_segura_test -f ~/BOOKONE/respaldos/<ARCHIVO_RESPALDO>.sql
  ```

### 2. Restaurar los Activos Digitales
```bash
tar -xzf ~/BOOKONE/respaldos/bookone_archivos_<FECHA>.tar.gz -C ~/BOOKONE
```

### 3. Verificación Post-Restauración
Comprueba que los usuarios, productos, órdenes y eventos de auditoría hayan sido recuperados íntegramente:
```bash
node --env-file=~/BOOKONE/aplicacion/backend/.env ~/BOOKONE/scripts/admin_cli.js admin@bookone.org users
node --env-file=~/BOOKONE/aplicacion/backend/.env ~/BOOKONE/scripts/admin_cli.js admin@bookone.org orders
node --env-file=~/BOOKONE/aplicacion/backend/.env ~/BOOKONE/scripts/admin_cli.js admin@bookone.org events 10
```