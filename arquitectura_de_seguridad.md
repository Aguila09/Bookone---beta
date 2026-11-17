# Arquitectura de Seguridad — BOOKONE

Este documento describe el diseño defensivo, los controles criptográficos, la topología de red y el mapeo de servicios de seguridad implementados en la plataforma **BOOKONE** (Puntos 12, 13, 14, 15, 18 y 20 del proyecto).

---

## 1. Modelo de Defensa en Profundidad (*Defense-in-Depth*)

BOOKONE separa estrictamente el **plano de consumo público/cliente** (navegador web sobre HTTPS/TLS 1.3) del **plano de control administrativo** (consola CLI sobre SSH endurecido dentro de una VPN cifrada con capa IPSec), minimizando la superficie de exposición ante ataques externos e internos.

```text
====================================================================================================
                                   PLANO DE CLIENTES (WEB)
====================================================================================================
  [ Navegador del Lector ]
         │
         │  HTTPS / TLS 1.3 (Certificado Ed25519 firmado por CA Local)
         ▼
  [ Firewall Perimetral UFW ]  ──► Solo puertos 443/tcp y 9443/tcp abiertos al segmento de clientes
         │
         ▼
  [ Servidor BOOKONE (CachyOS — Node.js + Express) ]
         ├── Autenticación y RBAC (JWT + token_version + Argon2id)
         ├── Módulo de Firma Digital Ed25519 (Comprobantes de compra)
         ├── Módulo de Fingerprinting (Marca única por Usuario + Orden en cada descarga)
         └── Persistencia Parametrizada ──► [ PostgreSQL: plataforma_segura ]

====================================================================================================
                                 PLANO ADMINISTRATIVO (AISLADO)
====================================================================================================
  [ Equipo Administrador (Debian Homelab — 100.106.162.37) ]
         │
         │  1. Túnel VPN Malla (Tailscale / WireGuard — interfaz tailscale0)
         │  2. Capa IPSec (strongSwan IKEv2 + ESP AES-256-GCM: Modo Túnel / Modo Transporte)
         │  3. Sesión SSH (OpenSSH — solo llave pública Ed25519, root bloqueado)
         ▼
  [ Firewall UFW (tailscale0) ]  ──► Puerto 22/tcp y tráfico ESP permitidos solo en tailscale0
         │
         ▼
  [ Consola Administrativa CLI (scripts/admin_cli.js) + Respaldos (backup/restore) ]
====================================================================================================
```

---

## 2. Mapeo de Servicios de Seguridad (Unidad 1)

Cada uno de los cinco pilares clásicos de la seguridad de la información está respaldado por controles técnicos verificables dentro de la plataforma:

| Servicio de Seguridad | Objetivo en BOOKONE | Mecanismos e Implementación Técnica |
| :--- | :--- | :--- |
| **Confidencialidad** | Proteger credenciales, sesiones, datos en tránsito y acceso administrativo frente a divulgación no autorizada. | • **TLS 1.3** en el portal web (`server.js`).<br>• Derivación de contraseñas con **Argon2id** y sal única (`password_hash` en `users`; cero contraseñas en texto claro).<br>• **VPN Tailscale + IPSec ESP (AES-256-GCM)** para el canal administrativo.<br>• Exclusión de claves privadas y `.env` mediante `.gitignore` y permisos `600`. |
| **Integridad** | Garantizar que los archivos digitales, comprobantes, registros y respaldo no sean alterados sin detección. | • Hashes criptográficos **SHA-256** almacenados en `products.file_hash` para validar cada obra digital antes de entregarla.<br>• **Firma digital Ed25519** sobre el contenido canónico del comprobante de compra.<br>• Consultas SQL parametrizadas (`pg`) y bitácora de eventos `security_events`.<br>• Verificación `sha256sum` sobre respaldos en `respaldos/`. |
| **Disponibilidad** | Asegurar la continuidad operativa del catálogo, la base de datos y la recuperación ante fallos. | • Respaldos automatizados de PostgreSQL (`scripts/backup_database.sh`) y empaquetado de activos digitales (`productos/`, `certificados/`, `claves_publicas/`).<br>• Procedimiento probado de restauración (`scripts/restore_database.sh`).<br>• Filtrado perimetral con **UFW** (`default deny incoming`) para bloquear puertos innecesarios. |
| **Autenticación** | Verificar de forma robusta la identidad de lectores, operadores y administradores. | • Verificación de contraseñas mediante **Argon2id** y emisión de tokens **JWT** con control de revocación (`token_version`).<br>• Tokens temporales de un solo uso con expiración para recuperación de contraseña.<br>• Autenticación mutua TLS mediante **CA local** y acceso SSH exclusivo por llave asimétrica **Ed25519**. |
| **No Repudio** | Impedir que el emisor niegue haber generado un comprobante o que un comprador niegue el origen de una copia filtrada. | • **Comprobante firmado digitalmente (Ed25519):** demostrable mediante la clave pública en `claves_publicas/`.<br>• **Fingerprinting individual:** incrustación del identificador `Usuario + Orden` dentro del contenido descargado.<br>• **Auditoría trazable (`security_events`):** registro de `LOGIN_SUCCESS`, `ORDER_CREATED`, `PAYMENT_APPROVED`, `SIGNATURE_CREATED`, `FINGERPRINT_CREATED` y `DOWNLOAD`. |

---

## 3. Criptografía Aplicada y PKI Local (Unidades 2 y 4)

### 3.1 Gestión de Credenciales y Tokens
* **Almacenamiento de contraseñas:** Se utiliza **Argon2id** (resistente a ataques por GPU/ASIC y canales laterales), delegando la generación de sal aleatoria a la biblioteca criptográfica. La tabla `users` carece de columnas para contraseñas en texto plano o cifrado reversible.
* **Control de sesiones:** Cada usuario posee un contador `token_version`. Cuando un administrador revoca sesiones o desactiva una cuenta, incrementar `token_version` invalida de inmediato cualquier JWT emitido previamente.

### 3.2 Infraestructura de Clave Pública (PKI) y TLS
* Mediante `scripts/generate_local_ca.sh` se crea una **Autoridad Certificadora (CA) raíz local** (`certificados/ca.crt`), cuya clave privada (`ca.key`) permanece aislada fuera del repositorio público.
* La CA firma el certificado del servidor (`certificados/server.crt`) con algoritmos modernos basados en curva **Ed25519**.
* Al importar `ca.crt` en el almacén de confianza del navegador cliente, se establece una sesión **HTTPS/TLS 1.3** confiable; cualquier conexión sin la CA o con un certificado autofirmado ajeno es rechazada por el cliente.

### 3.3 Firma Digital de Comprobantes
* Al aprobarse un pago simulado, el backend serializa los datos críticos de la transacción (ID de orden, usuario, artículos, precios históricos, total, fecha y referencia de pago), calcula su resumen criptográfico y lo firma con la **clave privada Ed25519** almacenada externamente con permisos restringidos.
* El cliente o cualquier auditor puede verificar la autenticidad e integridad del comprobante utilizando la clave pública disponible en `claves_publicas/`. Cualquier alteración de un solo byte invalida la firma.

---

## 4. Esteganografía y Fingerprinting de Productos (Unidad 3 — Punto 12)

Cada descarga autorizada ejecuta el módulo `aplicacion/backend/src/utils/fingerprinting.js`, generando una copia personalizada asociada de forma unívoca al par `(user_id, order_id)` y registrando el evento `FINGERPRINT_CREATED` en la tabla `downloads` y `security_events`.

### Justificación Técnica del Mecanismo
1. **Imperceptibilidad:** La huella se inserta en estructuras internas del formato del documento (metadatos estructurales, marcadores internos y secuencias no visibles en el renderizado normal de lectura), evitando degradar la experiencia visual o legibilidad del libro electrónico.
2. **Robustez:** A diferencia de un simple renombrado de archivo (que se pierde al copiar o renombrar el fichero), el *fingerprint* viaja incrustado dentro del flujo de bytes del contenido distribuido, sobreviviendo a transferencias entre dispositivos, compresiones sin pérdida y cambios de nombre.
3. **Capacidad:** El esquema de codificación permite almacenar cómodamente el identificador único de transacción, el identificador del comprador, la marca temporal y un código de verificación de integridad sin incrementar de forma significativa el tamaño del archivo original.
4. **Trazabilidad Forense:** Ante una copia sospechosa filtrada, el extractor lee la secuencia incrustada y recupera el `user_id` y `order_id` exactos para identificar el origen de la fuga.

---

## 5. Arquitectura de Red: VPN, IPSec (Modo Túnel y Transporte) y SSH (Punto 15)

### 5.1 Aislamiento del Acceso Administrativo
* El servidor **CachyOS** ejecuta el demonio **OpenSSH** configurado mediante `/etc/ssh/sshd_config.d/99-bookone-hardening.conf` para:
  * Escuchar **exclusivamente** en la dirección IP privada de la VPN (`ListenAddress 100.103.145.45`), quedando invisible en interfaces LAN o WAN públicas.
  * Prohibir el inicio de sesión como `root` (`PermitRootLogin no`) y deshabilitar cualquier autenticación por contraseña (`PasswordAuthentication no`), exigiendo llave pública **Ed25519** del usuario `victor`.
* El firewall **UFW** aplica `default deny incoming` y permite el puerto `22/tcp` únicamente sobre la interfaz virtual `tailscale0`.

### 5.2 Rol de IPSec y Comparativa: Modo Túnel vs. Modo Transporte
Para proteger el tráfico administrativo a nivel de capa de red (Capa 3 del modelo OSI), la arquitectura incorpora **IPSec (strongSwan con IKEv2 y ESP `aes256gcm16`)** con capacidad de conmutación dinámica (`/usr/local/bin/ipsec-mode`) entre sus dos modos de operación:

```text
MODO TRANSPORTE (Host-to-Host):
[ IP Original (100.106.162.37 -> 100.103.145.45) ] [ Cabecera ESP ] [ Payload TCP/SSH Cifrado ] [ Trailer ESP ]

MODO TÚNEL (Gateway-to-Gateway / Site-to-Site):
[ Nueva IP Externa ] [ Cabecera ESP ] [ IP Original + Payload TCP/SSH Cifrados ] [ Trailer ESP ]
```

* **Dónde se utiliza IPSec en Modo Túnel (*Tunnel Mode*):**
  * Es el estándar indicado para **interconectar sedes corporativas, redes de sucursales o gateways perimetrales** a través de Internet (*Site-to-Site VPN*), así como en concentradores de acceso remoto donde un gateway protege subredes internas completas (por ejemplo, una red de administradores `10.10.0.0/24` accediendo a una subred de servidores `10.20.0.0/24`).
  * Al encapsular y cifrar **todo el paquete IP original** (incluyendo las direcciones IP internas de origen y destino) dentro de un nuevo paquete IP entre gateways, oculta la topología interna frente a observadores externos en Internet.
* **Dónde se utiliza IPSec en Modo Transporte (*Transport Mode*):**
  * Se emplea en comunicaciones directas **extremo a extremo (*Host-to-Host*)** entre dos equipos específicos (como la estación de administración Debian y el servidor BOOKONE cuando ya existe enrutamiento privado), cifrando únicamente la carga útil (TCP/SSH) con menor sobrecarga de encabezados (*overhead*).

---

## 6. Principios de Aplicación Segura (Unidad 5)

* **Privilegio Mínimo y Separación de Responsabilidades:**
  * `CLIENTE`: restringido a consultar catálogo, gestionar su propio carrito/órdenes y descargar únicamente productos con pago aprobado.
  * `OPERADOR`: administra productos, precios y estados de órdenes, pero tiene bloqueado el cambio de roles, gestión de usuarios o acceso a claves privadas.
  * `ADMINISTRADOR`: gestiona cuentas, roles, revocación de sesiones y auditoría desde la consola CLI (`admin_cli.js`), sin acceso a contraseñas en claro ni interfaz web de compra.
* **Validación de Entradas y Manejo Seguro de Errores:** Validación estricta de esquemas y tipos en los endpoints REST, consultas SQL parametrizadas contra inyección SQL y respuestas de error genéricas hacia el cliente que evitan filtrar trazas internas del servidor (*stack traces*).
* **Trazabilidad Completa:** Todos los eventos críticos (`LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`, `PASSWORD_RESET`, `ORDER_CREATED`, `PAYMENT_APPROVED`, `DOWNLOAD`, `ROLE_CHANGED`, `ACCOUNT_DISABLED`, `SIGNATURE_CREATED`, `FINGERPRINT_CREATED`) quedan registrados con usuario, marca de tiempo, resultado e IP/origen.