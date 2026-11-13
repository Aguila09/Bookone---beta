# Certificados TLS Locales — Biblioteca Digital BOOKONE

Este directorio almacena la Autoridad Certificadora (CA) local y los certificados criptográficos emitidos para asegurar la capa web HTTPS de **BOOKONE** en entornos de desarrollo y red local.

## 1. Generar certificados

El script utiliza Curva Elíptica (ECDSA prime256v1 / TLS 1.3) con SAN para IP y dominio local.

Para uso exclusivo en esta computadora (`localhost`):
```bash
cd proyecto/scripts
./generate_local_ca.sh
```

Para permitir acceso seguro desde otros dispositivos en la red LAN (ej. tablet, lector electrónico o laptop), pase la IP local del servidor:
```bash
cd proyecto/scripts
./generate_local_ca.sh 192.168.1.50
```

## 2. Verificar la cadena de confianza

Para comprobar matemáticamente que el certificado del servidor (`server.crt`) fue firmado correctamente por la CA de BOOKONE (`ca.crt`):
```bash
openssl verify -CAfile ../certificados/ca.crt ../certificados/server.crt
```
*(El resultado debe ser: `../certificados/server.crt: OK`)*

## 3. Confiar en la CA local en el cliente

- Importe `certificados/ca.crt` en el almacén de certificados de confianza del sistema o navegador cliente.
- Con esto, `https://IP_DEL_SERVIDOR` se mostrará con candado verde seguro sin advertencias.
