# Claves Públicas y No Repudio — BOOKONE

Este directorio almacena las claves públicas utilizadas para la verificación de firmas digitales **Ed25519 (RFC 8032)** en los comprobantes y certificados Ex Libris emitidos por la Biblioteca Digital BOOKONE.

## Generación de Claves Ed25519

```bash
cd proyecto/scripts
./generate_ed25519_keys.sh
```

- `public_key.pem`: Clave pública distribuida a los lectores para validar la autenticidad del emisor.
- `private_key.pem`: Clave privada mantenida bajo control estricto del servidor de la biblioteca con permisos `chmod 600`.
