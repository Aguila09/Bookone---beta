# BOOKONE — Biblioteca Digital & Repositorio Seguro de Libros Digitales

**BOOKONE** es una plataforma de biblioteca digital de alta fidelidad orientada a la preservación, consulta y concesión segura de obras literarias y tratados científicos. El sistema implementa una arquitectura de defensa en profundidad donde cada libro digital está resguardado por resúmenes criptográficos, firmas digitales asimétricas y marcas de agua individualizadas (Ex Libris digital con fingerprinting).

---

## Filosofía de Diseño Frontend

A diferencia de las plantillas comerciales o generadas por IA (temas oscuros genéricos, degradados neón púrpura/cian y tarjetas sin identidad), **BOOKONE** adopta una **estética editorial y literaria clásica**:

- **Paleta de color:** Fondos de lino y papel pergamino (`#F7F4ED`, `#FBF9F4`), marcos de encuadernación en roble y cuero (`#3A2618`), sellos en rojo veneciano (`#85222E`) y acentos de pan de oro (`#C29227`).
- **Tipografía editorial:** Combinación de fuentes serif clásicas (*Cinzel* y *Cormorant Garamond*) para títulos, lomos y citas, asistidas por *Plus Jakarta Sans* para controles de lectura y datos técnicos.
- **Portada & Splash Screen Editorial:** Pantalla de bienvenida inmersiva con sello heráldico giratorio, doble filete dorado, marco ornamental en esquinas, lema latino institucional y verificación criptográfica (TLS 1.3, SHA-512, Ed25519, Argon2id). Se muestra únicamente la primera vez por sesión mediante `sessionStorage` para no interrumpir recargas posteriores.
- **Experiencia de biblioteca:** Volúmenes con relieve de lomo y marcapáginas, estantería personal ilustrada («Mi Estantería»), lector de sala integrado (*In-App Digital Folio*) con ajuste tipográfico, y certificados *Ex Libris* interactivos.

---

## Pilares Criptográficos y de Seguridad

| Principio                    | Mecanismo Implementado         | Justificación Técnica                                                                                                 |
| :--------------------------- | :----------------------------- | :---------------------------------------------------------------------------------------------------------------------- |
| **Autenticación**     | `Argon2id`                   | Algoritmo ganador del PHC, con coste de memoria (memory-hard) para impedir ataques masivos por GPU/ASIC.                |
| **Integridad de Obra** | `SHA-512`                    | Cada archivo de texto posee un hash de 512 bits calculado al catalogarse; se valida bit a bit antes de cada descarga.   |
| **No Repudio**         | `Ed25519 (RFC 8032)`         | Firma digital asimétrica sobre la curva Twisted Edwards 25519 que sella la concesión entre la biblioteca y el lector. |
| **Trazabilidad**       | `Fingerprinting / Ex Libris` | En cada descarga se inyecta un bloque inmutable de metadatos con el ID del lector, folio y marca de tiempo.             |
| **Control de Acceso**  | `RBAC + JWT`                 | Tres niveles: Lector (`CLIENTE`), Curador (`OPERADOR`) y Bibliotecario Mayor (`ADMINISTRADOR`).                   |
| **Confidencialidad**   | `HTTPS / TLS 1.3`            | Certificados locales X.509 generados mediante ECDSA (`prime256v1`) con SAN para red LAN.                              |
| **Auditoría**         | `security_events`            | Registro inmutable de eventos (`LOGIN_SUCCESS`, `DOWNLOAD`, `SIGNATURE_CREATED`, etc.).                           |

---

## Estructura del Repositorio

```text
proyecto/
├── aplicacion/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── middleware/     # Control de acceso por rol y validación JWT
│   │   │   ├── routes/         # Endpoints: auth, products (libros), orders, admin
│   │   │   ├── utils/          # Argon2id, Ed25519, SHA-512 y Fingerprinting
│   │   │   ├── db.js           # Conector PostgreSQL con Pool de conexiones
│   │   │   └── store.js        # Repositorio en memoria con acervo precargado
│   │   ├── test/               # Pruebas unitarias de seguridad y roles
│   │   ├── package.json
│   │   └── server.js           # Servidor Express HTTPS/HTTP
│   └── frontend/
│       ├── index.html          # Interfaz editorial de la biblioteca
│       ├── style.css           # Estilos literarios y encuadernación táctil
│       └── app.js              # Lógica de cliente, lector folio y Ex Libris
├── base_de_datos/
│   └── schema.sql              # Esquema relacional enriquecido para BOOKONE
├── certificados/               # Autoridad Certificadora (CA) y certificados TLS
├── claves_publicas/            # Claves públicas para verificación Ed25519
├── productos/                  # Acervo de libros digitales (.txt)
├── respaldos/                  # Copias de seguridad de la base de datos
├── scripts/                    # Scripts de CA, llaves Ed25519 y respaldo SQL
└── README.md
```

---

## Acervo Bibliográfico Precargado en BOOKONE

1. **El Arte de la Guerra** — *Sun Tzu* (Estrategia & Filosofía Militar)
2. **Tratado de Criptografía y Secreto Digital** — *Claude Shannon & Alan Turing* (Ciencias de la Computación)
3. **Don Quijote de la Mancha (Pasajes Selectos)** — *Miguel de Cervantes* (Literatura Clásica)
4. **Meditaciones** — *Marco Aurelio Antonino* (Filosofía Estoica)
5. **La Metamorfosis** — *Franz Kafka* (Ficción Filosófica)
6. **Principios de Seguridad en Repositorios Digitales** — *Víctor Ramos & Colaboradores* (Ciberseguridad)

---

## Cuentas de Acceso para Demostración

| Perfil                        | Correo Electrónico     | Contraseña     | Capacidades                                                                        |
| :---------------------------- | :---------------------- | :-------------- | :--------------------------------------------------------------------------------- |
| **Lector Registrado**   | `lector@bookone.org`  | `cliente123`  | Explorar catálogo, leer muestras, adquirir ejemplares, descargar con fingerprint. |
| **Curador de Archivo**  | `curador@bookone.org` | `operador123` | Todo lo anterior más catalogar nuevos libros y auditar hashes.                    |
| **Bibliotecario Mayor** | `admin@bookone.org`   | `admin123`    | Control total, gestión de roles de usuarios y visor de auditoría criptográfica. |

*(Nota: los correos anteriores como `cliente@plataforma.test`, `operador@plataforma.test` y `admin@plataforma.test` se mantienen admitidos como alias compatibles).*

---

## Puesta en Marcha

### 1. Configuración de Entorno (.env)

Cree o edite el archivo `aplicacion/backend/.env`:

```env
PORT=443
HTTPS_ENABLED=true
TLS_CERT_PATH=../../certificados/server.crt
TLS_KEY_PATH=../../certificados/server.key
JWT_SECRET=bookone-super-secret-cryptographic-key-2026
DATABASE_URL=postgresql://usuario:password@localhost:5432/bookone_biblioteca
DATABASE_SSL=false
```

*(Si desea iniciar en modo HTTP estándar sin certificados, configure `HTTPS_ENABLED=false` y `PORT=3000`).*

### 2. Generar Certificados TLS (Para HTTPS en LAN)

```bash
cd scripts
./generate_local_ca.sh 192.168.1.50
```

### 3. Iniciar el Servidor de BOOKONE

```bash
cd aplicacion/backend
npm install
npm start
```

### 4. Ejecutar la Suite de Pruebas Unitarias

```bash
cd aplicacion/backend
npm test
```

Verifica matemáticamente:

- Derivación correcta con `Argon2id`.
- Detección de alteración de archivos con `SHA-512`.
- Validez de la firma digital con `Ed25519` y rechazo de cargas manipuladas.
- Cumplimiento de jerarquía de roles (Lector, Curador, Bibliotecario).

---

## Verificación de Salud del Servicio

```bash
curl -k https://localhost:443/api/health
```

Respuesta esperada:

```json
{
  "status": "ok",
  "service": "bookone-biblioteca-digital",
  "institution": "BOOKONE Digital Library & Secure Repository",
  "version": "2.0.0",
  "tls": true,
  "cryptography": ["Argon2id", "SHA-512", "Ed25519", "TLS 1.3"]
}
```
