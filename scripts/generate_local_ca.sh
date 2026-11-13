#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="$BASE_DIR/certificados"
mkdir -p "$CERT_DIR"

SERVER_IP="${1:-127.0.0.1}"

# 1. Generar Root CA con ECDSA (prime256v1) para BOOKONE Biblioteca Digital
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes \
  -keyout "$CERT_DIR/ca.key" \
  -out "$CERT_DIR/ca.crt" \
  -days 3650 \
  -subj "/C=ES/ST=Spain/L=Valencia/O=BOOKONE Biblioteca Digital/CN=BOOKONE Root CA" \
  -addext "basicConstraints=critical,CA:TRUE"

# 2. Generar CSR y Clave Privada del Servidor con ECDSA
openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes \
  -keyout "$CERT_DIR/server.key" \
  -out "$CERT_DIR/server.csr" \
  -subj "/C=ES/ST=Spain/L=Valencia/O=BOOKONE Biblioteca Digital/CN=localhost"

# 3. Configurar extensiones (SAN) - Incluye localhost y la IP del servidor en LAN
cat > "$CERT_DIR/server.ext" <<EOF
subjectAltName=DNS:localhost,IP:127.0.0.1,IP:${SERVER_IP}
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
EOF

# 4. Firmar el certificado del servidor con la CA local de BOOKONE
openssl x509 -req -in "$CERT_DIR/server.csr" \
  -CA "$CERT_DIR/ca.crt" \
  -CAkey "$CERT_DIR/ca.key" \
  -CAcreateserial \
  -out "$CERT_DIR/server.crt" \
  -extfile "$CERT_DIR/server.ext" \
  -days 365 -sha256

# 5. Permisos de seguridad y cadena completa (Fullchain)
cat "$CERT_DIR/server.crt" "$CERT_DIR/ca.crt" > "$CERT_DIR/server.fullchain.crt"
chmod 600 "$CERT_DIR/ca.key" "$CERT_DIR/server.key"
chmod 644 "$CERT_DIR/ca.crt" "$CERT_DIR/server.crt" "$CERT_DIR/server.fullchain.crt"
rm -f "$CERT_DIR/server.ext" "$CERT_DIR/ca.srl"

echo "CA y certificado del servidor BOOKONE generados en $CERT_DIR (SAN IP: $SERVER_IP)"
