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
  mockData.ts        # datos simulados
```

---

⚠️ Úsalo solo en **tu propia red**. Administrar redes ajenas sin permiso es ilegal.
