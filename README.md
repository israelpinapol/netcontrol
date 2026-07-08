# NetControl — Panel de control total de tu red

Panel web para **administrar tu internet doméstico**: ver quién se conecta, cortar/pausar/bloquear dispositivos, bloquear webs y apps, definir horarios y límites, aprobar dispositivos nuevos, y medir velocidad y ancho de banda.

> **Importante — cómo funciona de verdad:** un sitio en la nube (Vercel) **no puede tocar tu módem por sí solo**. Este repo es el **panel de control (la UI + la lógica)**. Para ejecutar las órdenes reales (bloquear, cortar, medir) necesitas un **agente local** corriendo en tu red que hable con el router. El panel se comunica con ese agente por un túnel seguro.
>
> Hoy el panel funciona con un **backend DEMO** (datos simulados) para que puedas verlo y probarlo. Conectar un backend real es cambiar **una sola clase**.

```
┌────────────────┐      HTTPS/túnel seguro      ┌──────────────────────┐      LAN      ┌────────────┐
│  Panel (Vercel)│  ─────────────────────────►  │  Agente local (casa) │  ──────────►  │  Router /   │
│  este repo     │  ◄─────────────────────────  │  Pi-hole/OpenWRT/... │  ◄──────────  │  módem      │
└────────────────┘         estado + órdenes      └──────────────────────┘               └────────────┘
```

## Funciones del panel

- 📶 **Dispositivos**: lista en vivo con IP, dueño, consumo y app top. Botones **Permitir / Pausar / Cortar acceso** por dispositivo.
- 🛡️ **Bloqueo de webs y apps**: reglas por sitio, app o categoría, aplicables a toda la red o a un equipo.
- ⏰ **Horarios y límites**: corte o reducción de velocidad por franja horaria y días (ej. "sin internet 21:00–07:00 para la tablet").
- 🚨 **Dispositivos nuevos**: alerta cuando algo desconocido intenta entrar, con permitir/bloquear.
- ⚡ **Velocidad y ancho de banda**: test de velocidad, uso del plan, consumo por hora y por categoría.

## Correr en local

```bash
npm install
npm run dev
# http://localhost:3000
```

## Arquitectura de backends (adaptadores)

Todo el panel depende de **una sola interfaz**: [`lib/backend.ts`](lib/backend.ts) → `NetworkBackend`.
Para conectar tu red real, implementa esa interfaz y cámbiala en `getBackend()`.

| Método | Pi-hole | OpenWRT | UniFi | MikroTik | Firewalla |
|--------|---------|---------|-------|----------|-----------|
| `getSnapshot()` | `/admin/api.php` (clientes, queries) + `vnstat` | `ubus` / LuCI RPC | Controller API `/stat/sta` | RouterOS REST `/interface`, `/ip/dhcp-lease` | App API / MSP |
| `setDeviceStatus()` (cortar/pausar) | `iptables`/`nftables` por MAC | firewall rule por MAC | `cmd/stamgr` block-sta | `/ip/firewall/filter` add | box rule (pause device) |
| `toggleRule()` (web/app) | listas de bloqueo (regex/adlist) | dnsmasq / firewall | traffic rules | address-list + firewall | rules / target lists |
| `toggleSchedule()` | cron + iptables | cron / scheduled rules | scheduled block | `/system/scheduler` | time-based rules |
| `runSpeedTest()` | `speedtest-cli` en la Pi | `speedtest` pkg | Controller speedtest | bandwidth-test | built-in |

### Opciones recomendadas (de más fácil a más DIY)

1. **Firewalla** — caja lista que ya hace todo esto; el panel se conectaría a su API.
2. **Router con OpenWRT** — control total (firewall, QoS, bloqueo por MAC, horarios).
3. **Raspberry Pi + Pi-hole** como gateway/DNS — mejor opción casera y barata (+ `vnstat`/`nethogs`/`iptables`).
4. **API del router actual** (UniFi/MikroTik/ASUS…) si ya la trae — sin hardware extra.

## 🆓 Conectar a AdGuard Home (gratis, de verdad)

Backend real ya implementado en [`lib/backends/adguard.ts`](lib/backends/adguard.ts). **AdGuard Home** es open source y corre en cualquier dispositivo que ya tengas encendido.

### 1. Instala AdGuard Home (elige uno)

**Docker (lo más fácil, en tu PC/NAS/mini-PC):**
```bash
docker run --name adguardhome --restart unless-stopped \
  -v adg-work:/opt/adguardhome/work -v adg-conf:/opt/adguardhome/conf \
  -p 53:53/tcp -p 53:53/udp -p 3000:3000/tcp -p 80:80/tcp \
  -d adguard/adguardhome
```
**Raspberry Pi / Linux (script oficial):**
```bash
curl -s -S -L https://raw.githubusercontent.com/AdguardTeam/AdGuardHome/master/scripts/install.sh | sh -s -- -v
```
Abre `http://<ip-del-dispositivo>:3000`, crea usuario y contraseña.

### 2. Haz que AdGuard vea a TODA la red
En tu **router → DHCP/DNS**, pon como **servidor DNS** la IP del dispositivo con AdGuard.
Así todos los equipos pasan por él automáticamente (sin configurar cada uno).

### 3. Conecta el panel
En local: crea `.env` (copia de `.env.example`) con:
```bash
NETCONTROL_BACKEND=adguard
ADGUARD_URL=http://192.168.1.10:3000   # la IP de tu AdGuard
ADGUARD_USER=admin
ADGUARD_PASS=tu_password
```
`npm run dev` y el panel ya muestra tus dispositivos reales.

### 4. Panel en Vercel + casa (gratis)
Vercel está en la nube y no ve tu LAN. Opciones **gratis**:
- **Cloudflare Tunnel** (gratis): expone sólo el puerto 3000 de AdGuard con una URL HTTPS; pones esa URL en `ADGUARD_URL`.
- **Tailscale** (gratis): red privada; usas la IP Tailscale del dispositivo.
- **Más simple**: corre el panel también en el mismo dispositivo (`npm run build && npm start`) y olvídate del túnel.

En Vercel, define las mismas variables en **Project → Settings → Environment Variables**.

### Qué cubre y qué no (AdGuard, DNS)
| Función | AdGuard Home |
|---|:---:|
| Ver dispositivos / nuevos | ✅ |
| Cortar / permitir acceso | ✅ (allow/disallow client) |
| Bloquear webs/apps por equipo | ✅ (blocked services) |
| Uso (consultas por cliente) | ✅ |
| Mbps/GB por equipo · test velocidad | ❌ → añade **OpenWRT** (gratis) |

> Para Mbps/GB reales y corte a nivel de firewall, el siguiente adaptador gratis es **OpenWRT** (`luci-app-nlbwmon` para ancho de banda por dispositivo).

## 🚪 Control TOTAL con OpenWRT (gratis) — admitir/echar dispositivos + portal cautivo

El DNS (AdGuard) filtra contenido pero **no decide quién entra a la red** (un usuario se pone otro DNS y se lo salta). Para "control total" —admitir dispositivos nuevos, dar acceso dinámico, cortar de verdad— hay que controlar el **gateway**. Eso lo hace **OpenWRT** (firmware libre).

**Modelo:**
```
Módem ── [Router OpenWRT] ── Wi-Fi/casa
   Dispositivo nuevo → CUARENTENA (portal cautivo, sin internet)
   Admin lo aprueba en NetControl → regla de firewall → acceso dinámico ✅
```

Backend real en [`lib/backends/openwrt.ts`](lib/backends/openwrt.ts) (vía **ubus** JSON-RPC). Qué hace cada método:

| Método | Cómo en OpenWRT |
|--------|-----------------|
| `getSnapshot()` | leases DHCP (`luci-rpc getDHCPLeases`) + estado del portal (`ndsctl json`) + uso por MAC (`nlbw`) |
| `setDeviceStatus()` (cortar/permitir) | regla de firewall `nc-block-<mac>` (uci + `/etc/init.d/firewall reload`) |
| `setAccess(mac, grant)` (admitir/echar) | `ndsctl auth <mac>` / `ndsctl deauth <mac>` (portal cautivo opennds) |
| `runSpeedTest()` | `speedtest-netperf` |

**Paquetes en el router:** `luci-mod-rpc`, `rpcd-mod-file`, `opennds` (portal cautivo), `luci-app-nlbwmon` (ancho de banda, opcional). Un usuario rpcd con ACL para `luci-rpc`, `uci` (firewall) y `file exec`.

**Activar:** en `.env` (o env de Vercel) `NETCONTROL_BACKEND=openwrt` + `OPENWRT_URL/USER/PASS`. Combínalo con AdGuard para el filtrado de webs/apps.

> `setAccess` es la "página web donde el administrador da acceso": los dispositivos en cuarentena aparecen en el panel en **Solicitudes de acceso a la red** con botones *Dar acceso / Denegar*.

## Deploy

Desplegado en **Vercel**. Cada push a `main` genera un nuevo deploy.

## Estructura

```
app/                 # rutas Next.js (App Router)
  page.tsx           # dashboard (server) -> Dashboard (client)
  api/network/       # endpoint del snapshot
components/          # UI (Dashboard, iconos)
lib/
  types.ts           # modelos de dominio (agnósticos de backend)
  backend.ts         # interfaz NetworkBackend + DemoBackend
  backends/adguard.ts# adaptador real AdGuard Home (gratis)
  mockData.ts        # datos simulados
```

---

⚠️ Úsalo solo en **tu propia red**. Administrar redes ajenas sin permiso es ilegal.
