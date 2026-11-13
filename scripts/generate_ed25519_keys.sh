#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEY_DIR="$BASE_DIR/claves_publicas"
mkdir -p "$KEY_DIR"

openssl genpkey -algorithm Ed25519 -out "$KEY_DIR/private_key.pem"
openssl pkey -in "$KEY_DIR/private_key.pem" -pubout -out "$KEY_DIR/public_key.pem"

chmod 600 "$KEY_DIR/private_key.pem"
chmod 644 "$KEY_DIR/public_key.pem"

echo "Claves Ed25519 creadas en $KEY_DIR"
