# BOOKONE — Plataforma Segura de Venta y Distribución de Contenido Digital

**BOOKONE** es una biblioteca y librería digital diseñada bajo principios de defensa en profundidad (*Defense-in-Depth*), confidencialidad, integridad criptográfica, trazabilidad y aislamiento de planos de control.

---

## Arquitectura del Sistema

```text
[ Cliente Lector (Navegador) ]
        │  HTTPS / TLS 1.3 (Certificado Ed25519 + CA Local)
        ▼
[ Servidor BOOKONE (CachyOS Linux - Node.js + Express) ] ◄──┐
        │  SQL Parametrizado (pg)                            │ Túnel VPN (Tailscale) + IPSec ESP
        ▼                                                    │ (Modo Túnel / Transporte con strongSwan)
[ PostgreSQL (plataforma_segura) ]                           │ + SSH Ed25519 (Solo tailscale0)
                                                             │
                                                [ Equipo Administrador (Debian Homelab) ]
                                                  ├─ Script: /usr/local/bin/ipsec-mode
                                                  └─ Consola CLI: scripts/admin_cli.js
```

### Pilares de Seguridad Implementados

1. **Transporte Cifrado (TLS 1.3):** Servidor HTTPS nativo con Autoridad Certificadora (CA) local y certificados firmados mediante curva **Ed25519** (`scripts/generate_local_ca.sh`).
2. **Autenticación y Control de Acceso (RBAC):** Contraseñas derivadas con **Argon2id**, tokens JWT con revocación por `token_version` y aislamiento estricto de planos: los roles `ADMINISTRADOR` y `OPERADOR` tienen bloqueado el acceso web y operan exclusivamente vía consola CLI sobre SSH.
3. **Integridad y Trazabilidad de Entregables:**
   * Firma digital asimétrica **Ed25519** por transacción (`SIGNATURE_CREATED`).
   * Huella digital única (*Watermarking / Fingerprinting*) incrustada en cada copia descargada (`FINGERPRINT_CREATED`).
   * Bitácora de auditoría inmutable en PostgreSQL (`security_events`).
4. **Endurecimiento de Red, VPN e IPSec (Modo Túnel y Transporte):**
   * Firewall perimetral (`ufw`) con política por defecto `deny incoming`, autorizando tráfico administrativo únicamente en la interfaz `tailscale0`.
   * Acceso remoto aislado mediante red privada virtual **Tailscale**, **OpenSSH** restringido a llave pública **Ed25519** y capa criptográfica **IPSec (strongSwan / IKEv2 + ESP AES-256-GCM)** con conmutación en vivo entre **Modo Túnel** (protección gateway/subred) y **Modo Transporte** (protección extremo a extremo).

---

## Estructura del Repositorio

```text
BOOKONE/
├── aplicacion/
│   ├── backend/
│   │   ├── .env.example                 # Plantilla de variables de entorno
│   │   ├── package.json                 # Dependencias del servidor Node.js
│   │   ├── server.js                    # Punto de entrada HTTPS / Express
│   │   ├── src/
│   │   │   ├── db.js                    # Pool de conexión PostgreSQL
│   │   │   ├── store.js                 # Lógica de negocio y persistencia
│   │   │   ├── middleware/auth.js       # Verificación JWT y RBAC
│   │   │   ├── routes/                  # Endpoints: auth, products, orders, admin
│   │   │   └── utils/                   # security.js, authorization.js, fingerprinting.js
│   │   └── test/                        # Pruebas automatizadas de seguridad y autorización
│   └── frontend/
│       ├── index.html                   # Portal web de BOOKONE
│       ├── app.js                       # Lógica de cliente y manejo de sesión
│       ├── style.css                    # Estilos de interfaz
│       └── covers/                      # Portadas del catálogo (.webp / .jpg)
├── base_de_datos/
│   └── schema.sql                       # Esquema relacional, roles, órdenes y auditoría
├── certificados/                        # CA local y certificados TLS del servidor
├── claves_publicas/                     # Claves públicas Ed25519 de verificación
├── productos/                           # Obras digitales originales y copias marcadas (downloads/)
├── respaldos/                           # Copias de seguridad de la base de datos (.sql)
├── evidencias/                          # Capturas y registros de pruebas obligatorias
├── scripts/
│   ├── admin_cli.js                     # Consola administrativa (users, orders, events)
│   ├── generate_local_ca.sh             # Generador de CA y certificados TLS Ed25519
│   ├── generate_ed25519_keys.sh         # Generador de llaves de firma de entregables
│   ├── backup_database.sh               # Respaldo íntegro de PostgreSQL
│   └── restore_database.sh              # Restauración ante desastres
├── Guia.md                              # Manual completo de instalación, red y operación
└── README.md
```

---

## Inicio Rápido

Consulta **[Guia.md](./Guia.md)** para desplegar desde cero:

* Base de datos PostgreSQL y esquema inicial (`base_de_datos/schema.sql`).
* Generación de certificados TLS y claves Ed25519.
* Arranque del servidor backend/frontend en CachyOS.
* Configuración del túnel VPN Tailscale + IPSec (`strongSwan` en Modo Túnel/Transporte) + SSH endurecido + Firewall `ufw` para administración desde Debian Homelab.

### Pruebas de Seguridad Automatizadas

```bash
cd aplicacion/backend
npm test
```