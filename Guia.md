# Guía de Despliegue y Operación desde Cero — BOOKONE

Este documento detalla la puesta en marcha completa del ecosistema **BOOKONE** dividido en sus tres componentes operativos:

1. **Servidor Central (CachyOS):** Base de datos PostgreSQL, criptografía TLS/Ed25519, Backend Node.js, Firewall `ufw` y demonio IPSec (`strongSwan`).
2. **Cliente Lector (Navegador Web):** Instalación de la CA local, compra simulada y descarga con huella digital.
3. **Administrador Remoto (Debian):** Túnel VPN Tailscale, conmutación IPSec (Modo Túnel / Modo Transporte), autenticación SSH con llave Ed25519 y gestión mediante `admin_cli.js`.

---

## Parte I: Configuración del Servidor Central (CachyOS Linux)

### 1. Instalación de paquetes base

```bash
sudo pacman -Syu nodejs npm postgresql openssl openssh tailscale ufw strongswan tcpdump
```

### 2. Inicialización y configuración de PostgreSQL

1. Inicializa el clúster de datos y habilita el servicio:

   ```bash
   sudo -u postgres initdb -D /var/lib/postgres/data
   sudo systemctl enable --now postgresql
   ```
2. Crea la base de datos `plataforma_segura` y carga el esquema inicial:

   ```bash
   sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';"
   sudo -u postgres psql -c "CREATE DATABASE plataforma_segura;"
   sudo -u postgres psql -d plataforma_segura -f ~/BOOKONE/base_de_datos/schema.sql
   ```

   *Verificación:* Ejecuta `sudo -u postgres psql -d plataforma_segura -c "\dt"` y confirma que existen las tablas (`users`, `products`, `orders`, `order_items`, `payments`, `downloads`, `security_events`).

### 3. Generación de Certificados TLS y Claves Criptográficas Ed25519

1. Otorga permisos de ejecución a los scripts y genera la Autoridad Certificadora (CA) local y los certificados TLS del servidor:

   ```bash
   chmod +x ~/BOOKONE/scripts/*.sh
   cd ~/BOOKONE
   ./scripts/generate_local_ca.sh
   ```
2. Genera el par de claves **Ed25519** utilizadas para firmar digitalmente cada entrega de contenido:

   ```bash
   ./scripts/generate_ed25519_keys.sh
   ```

   *Verificación:* Comprueba que existan `certificados/ca.crt`, `certificados/server.crt`, `certificados/server.fullchain.crt` y las claves públicas en `claves_publicas/`.

### 4. Configuración del Backend y Enlace de Dependencias

1. Crea el archivo `.env` a partir de la plantilla y ajusta tus secretos:

   ```bash
   cp ~/BOOKONE/aplicacion/backend/.env.example ~/BOOKONE/aplicacion/backend/.env
   ```

   Asegúrate de que `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/plataforma_segura` y `HTTPS_PORT=9443` (o `443`) coincidan con tu entorno.
2. Instala las dependencias de Node.js y crea el enlace simbólico en la raíz para que `scripts/admin_cli.js` resuelva los módulos:

   ```bash
   cd ~/BOOKONE/aplicacion/backend
   npm install
   ln -sfn ~/BOOKONE/aplicacion/backend/node_modules ~/BOOKONE/node_modules
   ```

   *Verificación:* Ejecuta `npm test` dentro de `aplicacion/backend` para validar que las pruebas de seguridad y autorización (`authorization.test.js` y `security.test.js`) pasen sin errores.

### 5. Arranque del Servidor BOOKONE

```bash
cd ~/BOOKONE/aplicacion/backend
node server.js
```

*Verificación:* La consola debe confirmar que el servidor HTTPS de BOOKONE está escuchando en el puerto configurado (`9443` o `443`) y conectado a PostgreSQL.

---

## Parte II: Configuración de Red Privada (Tailscale), SSH, IPSec y Firewall

### 1. Enlazar el Servidor CachyOS a Tailscale

```bash
sudo systemctl enable --now tailscaled
sudo tailscale up
tailscale ip -4
```

*Anota la IP privada asignada al servidor (ej. `100.103.145.45`).*

### 2. Preparar el Equipo Administrador (Debian Homelab)

En la laptop **Debian** desde donde se administrará el servidor:

1. Instala Tailscale e inicia sesión con la **misma cuenta**:

   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up
   tailscale status
   ```

   *Anota la IP privada asignada al homelab Debian (ej. `100.106.162.37`).*
2. Genera una llave SSH **Ed25519** y autorízala en CachyOS (reemplaza `<IP_TAILSCALE_CACHYOS>`):

   ```bash
   ssh-keygen -t ed25519 -C "debian-homelab-admin"
   ssh-copy-id -i ~/.ssh/id_ed25519.pub victor@<IP_TAILSCALE_CACHYOS>
   ```

   *Verificación:* Ejecuta `ssh victor@<IP_TAILSCALE_CACHYOS> "hostname"` y comprueba que ingresa sin pedir contraseña.

### 3. Endurecimiento de OpenSSH y Firewall en CachyOS

De vuelta en el servidor **CachyOS**:

1. Restringe `sshd` para que deshabilite contraseñas, bloquee `root` y escuche **únicamente** en la IP de Tailscale:

   ```bash
   sudo systemctl enable --now sshd
   sudo bash -c 'IP_TS=$(tailscale ip -4) && printf "ListenAddress %s\nPermitRootLogin no\nPubkeyAuthentication yes\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nChallengeResponseAuthentication no\nPermitEmptyPasswords no\nAllowUsers victor\nMaxAuthTries 3\nX11Forwarding no\n" "$IP_TS" > /etc/ssh/sshd_config.d/99-bookone-hardening.conf'
   ```
2. Asegura que `sshd` arranque después de `tailscaled` al reiniciar el equipo:

   ```bash
   sudo mkdir -p /etc/systemd/system/sshd.service.d
   sudo bash -c 'printf "[Unit]\nAfter=tailscaled.service\nWants=tailscaled.service\n" > /etc/systemd/system/sshd.service.d/tailscale-order.conf'
   sudo systemctl daemon-reload
   sudo sshd -t && sudo systemctl restart sshd
   ```
3. Configura las reglas del firewall `ufw` para HTTPS, SSH sobre `tailscale0` y tráfico IPSec proveniente del homelab Debian (`100.106.162.37`):

   ```bash
   sudo ufw default deny incoming
   sudo ufw default allow outgoing
   sudo ufw allow in on tailscale0 to any port 22 proto tcp
   sudo ufw allow in on tailscale0 from 100.106.162.37
   sudo ufw allow 9443/tcp
   sudo ufw allow 443/tcp
   sudo ufw deny 3000/tcp
   sudo ufw enable
   sudo ufw status verbose
   ```

   *Verificación:* El puerto `22/tcp` debe mostrarse permitido únicamente en `tailscale0` (`22/tcp on tailscale0 ALLOW IN`) y el acceso desde `100.106.162.37` habilitado en `tailscale0`.

### 4. Configuración de IPSec (`strongSwan`) con Cambio entre Modo Túnel y Modo Transporte

1. **En CachyOS (`100.103.145.45`):** crea `/etc/swanctl/conf.d/bookone-ipsec.conf` con ambos perfiles (`bookone-tunnel` y `bookone-transport`):

   ```bash
   sudo mkdir -p /etc/swanctl/conf.d
   sudo bash -c 'cat > /etc/swanctl/conf.d/bookone-ipsec.conf << "EOF"
   connections {
       bookone-tunnel {
           local_addrs = 100.103.145.45
           remote_addrs = 100.106.162.37
           version = 2
           proposals = aes256gcm16-prfsha384-ecp384
           local { auth = psk; id = cachyos-server }
           remote { auth = psk; id = debian-homelab }
           children {
               net-tunnel {
                   mode = tunnel
                   local_ts = 100.103.145.45/32
                   remote_ts = 100.106.162.37/32
                   esp_proposals = aes256gcm16-ecp384
               }
           }
       }
       bookone-transport {
           local_addrs = 100.103.145.45
           remote_addrs = 100.106.162.37
           version = 2
           proposals = aes256gcm16-prfsha384-ecp384
           local { auth = psk; id = cachyos-server }
           remote { auth = psk; id = debian-homelab }
           children {
               host-transport {
                   mode = transport
                   esp_proposals = aes256gcm16-ecp384
               }
           }
       }
   }
   secrets {
       ike-bookone {
           id-1 = cachyos-server
           id-2 = debian-homelab
           secret = "BOOKONE-IPSEC-PSK-2026-SEGURIDAD"
       }
   }
   EOF
   chmod 600 /etc/swanctl/conf.d/bookone-ipsec.conf'
   sudo systemctl enable --now strongswan
   sudo swanctl --load-all
   ```
2. **En Debian Homelab (`100.106.162.37`):** instala los paquetes `swanctl`, carga el perfil inverso y crea el comando `/usr/local/bin/ipsec-mode`:

   ```bash
   sudo apt update && sudo apt install -y strongswan charon-systemd strongswan-swanctl
   sudo mkdir -p /etc/swanctl/conf.d
   sudo bash -c 'cat > /etc/swanctl/conf.d/bookone-ipsec.conf << "EOF"
   connections {
       bookone-tunnel {
           local_addrs = 100.106.162.37
           remote_addrs = 100.103.145.45
           version = 2
           proposals = aes256gcm16-prfsha384-ecp384
           local { auth = psk; id = debian-homelab }
           remote { auth = psk; id = cachyos-server }
           children {
               net-tunnel {
                   mode = tunnel
                   local_ts = 100.106.162.37/32
                   remote_ts = 100.103.145.45/32
                   esp_proposals = aes256gcm16-ecp384
               }
           }
       }
       bookone-transport {
           local_addrs = 100.106.162.37
           remote_addrs = 100.103.145.45
           version = 2
           proposals = aes256gcm16-prfsha384-ecp384
           local { auth = psk; id = debian-homelab }
           remote { auth = psk; id = cachyos-server }
           children {
               host-transport {
                   mode = transport
                   esp_proposals = aes256gcm16-ecp384
               }
           }
       }
   }
   secrets {
       ike-bookone {
           id-1 = cachyos-server
           id-2 = debian-homelab
           secret = "BOOKONE-IPSEC-PSK-2026-SEGURIDAD"
       }
   }
   EOF
   chmod 600 /etc/swanctl/conf.d/bookone-ipsec.conf'
   sudo systemctl enable --now strongswan
   sudo swanctl --load-all
   ```
3. **Instalar el conmutador rápido `ipsec-mode` en Debian Homelab:**

   ```bash
   sudo bash -c 'cat > /usr/local/bin/ipsec-mode << "EOF"
   #!/usr/bin/env bash
   set -e
   case "$1" in
     tunnel)
       sudo swanctl --terminate --ike bookone-transport 2>/dev/null || true
       sudo swanctl --initiate --child net-tunnel
       ;;
     transport)
       sudo swanctl --terminate --ike bookone-tunnel 2>/dev/null || true
       sudo swanctl --initiate --child host-transport
       ;;
     off)
       sudo swanctl --terminate --ike bookone-tunnel 2>/dev/null || true
       sudo swanctl --terminate --ike bookone-transport 2>/dev/null || true
       ;;
     status)
       sudo swanctl --list-sas
       sudo ip xfrm policy | grep -E "src|mode"
       ;;
     *)
       echo "Uso: sudo ipsec-mode {tunnel|transport|status|off}"
       exit 1
       ;;
   esac
   EOF
   chmod +x /usr/local/bin/ipsec-mode'
   ```

   *Verificación:* Ejecuta `sudo ipsec-mode tunnel` y luego `sudo ipsec-mode status` para confirmar `mode tunnel`; después ejecuta `sudo ipsec-mode transport` y `sudo ipsec-mode status` para verificar el cambio en vivo a `mode transport`.

---

## Parte III: Uso como Cliente Lector (Navegador Web)

1. **Importar el Certificado Raíz (`ca.crt`):**

   * En el navegador del equipo cliente, abre **Configuración → Privacidad y seguridad → Certificados → Ver certificados → Autoridades → Importar**.
   * Selecciona el archivo `BOOKONE/certificados/ca.crt` y marca la casilla **"Confiar en esta CA para identificar sitios web"**.
2. **Navegar y Adquirir Contenido:**

   * Accede a `https://<IP_SERVIDOR>:9443` (puedes usar la IP LAN o la IP de Tailscale del servidor).
   * Inicia sesión con una cuenta de lector (ej. `lector@bookone.org`) o registra un usuario nuevo.
   * Agrega un libro al carrito, completa el pago simulado (`TARJETA_SIMULADA_PRUEBA`) y descarga el archivo.
   * *Verificación:* El archivo descargado se almacena en `productos/downloads/` con su firma digital Ed25519 y huella de agua única asociada al usuario y al pedido.

---

## Parte IV: Operación como Administrador Remoto (Desde Otra Red)

1. **Activar el modo IPSec deseado y conectar por SSH desde Debian Homelab (incluso desde datos móviles o red externa):**

   ```bash
   sudo ipsec-mode tunnel
   ssh victor@<IP_TAILSCALE_CACHYOS>
   ```
   *(Opcional: en otra terminal de CachyOS puedes ejecutar `sudo tcpdump -i tailscale0 esp -c 4` para evidenciar el tráfico cifrado ESP en tiempo real).*
2. **Consultas en la Consola Administrativa (`admin_cli.js`):**

   * **Listar usuarios registrados, roles y versión de token:**

     ```bash
     node --env-file=~/BOOKONE/aplicacion/backend/.env ~/BOOKONE/scripts/admin_cli.js admin@bookone.org users
     ```
   * **Consultar órdenes de compra y referencias de pago:**

     ```bash
     node --env-file=~/BOOKONE/aplicacion/backend/.env ~/BOOKONE/scripts/admin_cli.js admin@bookone.org orders
     ```
   * **Auditar los últimos N eventos criptográficos y de acceso:**

     ```bash
     node --env-file=~/BOOKONE/aplicacion/backend/.env ~/BOOKONE/scripts/admin_cli.js admin@bookone.org events 10
     ```
3. **Respaldo y Restauración de la Base de Datos:**

   * Generar copia de seguridad en `respaldos/`:

     ```bash
     ~/BOOKONE/scripts/backup_database.sh
     ```
   * Restaurar desde un respaldo previo:

     ```bash
     ~/BOOKONE/scripts/restore_database.sh <ARCHIVO_RESPALDO.sql>
     ```
