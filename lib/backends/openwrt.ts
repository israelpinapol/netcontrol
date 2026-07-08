import type { NetworkBackend } from "../backend";
import type {
  AccessRequest,
  Device,
  DeviceStatus,
  DeviceType,
  NetworkSnapshot,
} from "../types";

/**
 * Adaptador REAL para OpenWRT (firmware libre) — CONTROL DE GATEWAY.
 *
 * A diferencia del DNS (AdGuard), OpenWRT controla la puerta de enlace, así que
 * puede ADMITIR/EXPULSAR dispositivos de verdad y dar "acceso dinámico":
 *   ✅ ver dispositivos (leases DHCP), ✅ cortar/permitir por MAC (firewall),
 *   ✅ portal cautivo: dispositivo nuevo en cuarentena → admin aprueba (opennds),
 *   ✅ ancho de banda por equipo (nlbwmon), ✅ test de velocidad (speedtest).
 *
 * Requisitos en el router OpenWRT:
 *   - Acceso ubus por HTTP (uhttpd + rpcd). Paquetes: `luci-mod-rpc`, `rpcd-mod-file`.
 *   - Portal cautivo (admisión de nuevos): `opennds` (usa `ndsctl`).
 *   - Ancho de banda por equipo (opcional): `luci-app-nlbwmon` (usa `nlbw`).
 *   - Test de velocidad (opcional): `speedtest-netperf`.
 *   - Un usuario rpcd con ACL para: luci-rpc, uci (firewall), file exec.
 *
 * Config por variables de entorno:
 *   NETCONTROL_BACKEND=openwrt
 *   OPENWRT_URL=http://192.168.1.1      (IP del router o su túnel Cloudflare/Tailscale)
 *   OPENWRT_USER=root
 *   OPENWRT_PASS=tu_password
 *   OPENWRT_ROUTER_NAME="Casa - OpenWRT"  (opcional)
 *
 * ubus JSON-RPC: POST {base}/ubus  (docs OpenWRT: JSON-RPC over ubus).
 */

const NULL_SESSION = "00000000000000000000000000000000";

interface DhcpLease {
  hostname?: string;
  ipaddr: string;
  macaddr: string;
  expires?: number;
}
interface NdsClient {
  mac?: string;
  ip?: string;
  hostname?: string;
  state?: string; // "Authenticated" | "Preauthenticated" ...
  authenticated?: number; // 0 | 1
}

function guessType(name: string): DeviceType {
  const n = (name || "").toLowerCase();
  if (/iphone|android|phone|pixel|galaxy|movil|móvil/.test(n)) return "phone";
  if (/ipad|tablet/.test(n)) return "tablet";
  if (/tv|roku|chromecast|firestick|shield/.test(n)) return "tv";
  if (/playstation|ps4|ps5|xbox|nintendo|switch/.test(n)) return "console";
  if (/macbook|laptop|notebook/.test(n)) return "laptop";
  if (/pc|desktop|imac/.test(n)) return "desktop";
  if (/cam|camera|sensor|bulb|plug|echo|alexa|nest|iot/.test(n)) return "iot";
  return "phone";
}

export class OpenWrtBackend implements NetworkBackend {
  private base: string;
  private user: string;
  private pass: string;
  private session?: string;

  constructor() {
    this.base = (process.env.OPENWRT_URL || "http://192.168.1.1").replace(/\/$/, "");
    this.user = process.env.OPENWRT_USER || "root";
    this.pass = process.env.OPENWRT_PASS || "";
  }

  // ---- transporte ubus ----
  private async rpc(session: string, object: string, method: string, args: unknown = {}): Promise<unknown> {
    const res = await fetch(`${this.base}/ubus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "call", params: [session, object, method, args] }),
    });
    if (!res.ok) throw new Error(`ubus HTTP ${res.status}`);
    const json = (await res.json()) as { result?: [number, unknown]; error?: unknown };
    if (!json.result) throw new Error(`ubus sin result: ${JSON.stringify(json.error ?? {})}`);
    const [code, payload] = json.result;
    if (code !== 0) throw new Error(`ubus code ${code} en ${object}.${method}`);
    return payload;
  }

  private async login(): Promise<string> {
    if (this.session) return this.session;
    const payload = (await this.rpc(NULL_SESSION, "session", "login", {
      username: this.user,
      password: this.pass,
      timeout: 3600,
    })) as { ubus_rpc_session?: string };
    if (!payload.ubus_rpc_session) throw new Error("login OpenWRT fallido");
    this.session = payload.ubus_rpc_session;
    return this.session;
  }

  private async call(object: string, method: string, args: unknown = {}): Promise<unknown> {
    const s = await this.login();
    return this.rpc(s, object, method, args);
  }

  /** Ejecuta un comando en el router vía rpcd-mod-file (`file exec`). */
  private async exec(command: string, params: string[] = []): Promise<string> {
    const out = (await this.call("file", "exec", { command, params })) as { code?: number; stdout?: string };
    return out.stdout ?? "";
  }

  // ---- lectura ----
  async getSnapshot(): Promise<NetworkSnapshot> {
    await this.login();

    const leases = await this.getLeases();
    const nds = await this.getNdsClients();
    const blockedMacs = await this.getBlockedMacs();
    const bw = await this.getBandwidthByMac();

    // clientes autenticados por opennds (para saber quién tiene acceso)
    const authedMacs = new Set(
      nds.filter((c) => c.authenticated === 1 || /^auth/i.test(c.state || "")).map((c) => (c.mac || "").toLowerCase()),
    );

    const devices: Device[] = leases.map((l) => {
      const mac = (l.macaddr || "").toLowerCase();
      const blocked = blockedMacs.has(mac);
      const b = bw.get(mac);
      return {
        id: mac || l.ipaddr,
        name: l.hostname || `Dispositivo ${l.ipaddr}`,
        owner: "—",
        type: guessType(l.hostname || ""),
        mac,
        ip: l.ipaddr,
        status: blocked ? "blocked" : "allowed",
        online: (l.expires ?? 1) !== 0,
        downMbps: b?.downMbps ?? 0,
        upMbps: b?.upMbps ?? 0,
        usageTodayGb: b?.gb ?? 0,
        connectedMinutes: 0,
        topApp: authedMacs.size ? (authedMacs.has(mac) ? "con acceso" : "—") : "—",
        firstSeen: "",
      };
    });

    // Cuarentena: clientes vistos por el portal cautivo que NO están autenticados
    const accessRequests: AccessRequest[] = nds
      .filter((c) => c.authenticated === 0 || /^pre/i.test(c.state || ""))
      .map((c) => ({
        mac: (c.mac || "").toLowerCase(),
        ip: c.ip || "",
        name: c.hostname || "Dispositivo nuevo",
        since: "",
      }));

    const online = devices.filter((d) => d.online);
    return {
      routerName: process.env.OPENWRT_ROUTER_NAME || "Casa - OpenWRT",
      wanIp: await this.getWanIp(),
      ssid: "OpenWRT",
      online: true,
      speed: { downMbps: 0, upMbps: 0, pingMs: 0, jitterMs: 0, planDownMbps: 0, at: "" },
      devices,
      rules: [], // bloqueo de webs/apps: combinar con AdGuard o dnsmasq (ver README)
      schedules: [],
      usageByHour: [],
      usageByCategory: [],
      accessRequests,
      totals: {
        devicesOnline: online.length,
        usageTodayGb: Number(devices.reduce((a, d) => a + d.usageTodayGb, 0).toFixed(1)),
        blockedCount: devices.filter((d) => d.status === "blocked").length,
        newDevices: accessRequests.length,
      },
    };
  }

  private async getLeases(): Promise<DhcpLease[]> {
    try {
      const r = (await this.call("luci-rpc", "getDHCPLeases", {})) as { dhcp_leases?: DhcpLease[] };
      return r.dhcp_leases ?? [];
    } catch {
      return [];
    }
  }

  private async getWanIp(): Promise<string> {
    try {
      const r = (await this.call("network.interface.wan", "status", {})) as {
        "ipv4-address"?: Array<{ address?: string }>;
      };
      return r["ipv4-address"]?.[0]?.address || "—";
    } catch {
      return "—";
    }
  }

  private async getNdsClients(): Promise<NdsClient[]> {
    // opennds expone su estado con `ndsctl json`
    try {
      const out = await this.exec("/usr/bin/ndsctl", ["json"]);
      if (!out) return [];
      const parsed = JSON.parse(out) as { clients?: Record<string, NdsClient> } | NdsClient[];
      if (Array.isArray(parsed)) return parsed;
      return Object.values(parsed.clients ?? {});
    } catch {
      return [];
    }
  }

  /** MACs con regla de corte creada por este panel (nc-block-<mac>). */
  private async getBlockedMacs(): Promise<Set<string>> {
    try {
      const out = await this.exec("/sbin/uci", ["show", "firewall"]);
      const set = new Set<string>();
      for (const m of out.matchAll(/firewall\.\w+\.src_mac='?([0-9A-Fa-f:]+)'?/g)) {
        // sólo si la regla es de las nuestras (target DROP con nombre nc-block)
        set.add(m[1].toLowerCase());
      }
      // filtrar a las que tienen name nc-block-*
      const blocked = new Set<string>();
      for (const m of out.matchAll(/name='nc-block-([0-9A-Fa-f-]+)'/g)) {
        blocked.add(m[1].replace(/-/g, ":").toLowerCase());
      }
      return blocked.size ? blocked : set;
    } catch {
      return new Set();
    }
  }

  private async getBandwidthByMac(): Promise<Map<string, { downMbps: number; upMbps: number; gb: number }>> {
    const map = new Map<string, { downMbps: number; upMbps: number; gb: number }>();
    try {
      // nlbwmon: bytes acumulados por MAC (rx/tx). No es Mbps instantáneo, pero da el uso.
      const out = await this.exec("/usr/sbin/nlbw", ["-c", "csv", "-g", "mac", "-o", "mac,rx_bytes,tx_bytes"]);
      for (const line of out.split("\n").slice(1)) {
        const [mac, rx, tx] = line.split(",");
        if (!mac) continue;
        const gb = (Number(rx || 0) + Number(tx || 0)) / 1e9;
        map.set(mac.toLowerCase(), { downMbps: 0, upMbps: 0, gb: Number(gb.toFixed(2)) });
      }
    } catch {
      /* nlbwmon no instalado: uso queda en 0 */
    }
    return map;
  }

  // ---- órdenes ----
  async setDeviceStatus(deviceId: string, status: DeviceStatus): Promise<void> {
    const mac = deviceId.toLowerCase();
    if (status === "allowed") await this.removeBlock(mac);
    else await this.addBlock(mac); // blocked | paused => cortar por firewall
  }

  private async addBlock(mac: string): Promise<void> {
    const name = `nc-block-${mac.replace(/:/g, "-")}`;
    // crea una regla de firewall que DROPea el tráfico de ese MAC hacia la WAN
    await this.exec("/sbin/uci", ["set", `firewall.${name}=rule`]);
    await this.exec("/sbin/uci", ["set", `firewall.${name}.name=${name}`]);
    await this.exec("/sbin/uci", ["set", `firewall.${name}.src=lan`]);
    await this.exec("/sbin/uci", ["set", `firewall.${name}.dest=wan`]);
    await this.exec("/sbin/uci", ["set", `firewall.${name}.src_mac=${mac}`]);
    await this.exec("/sbin/uci", ["set", `firewall.${name}.target=DROP`]);
    await this.exec("/sbin/uci", ["commit", "firewall"]);
    await this.exec("/etc/init.d/firewall", ["reload"]);
  }

  private async removeBlock(mac: string): Promise<void> {
    const name = `nc-block-${mac.replace(/:/g, "-")}`;
    await this.exec("/sbin/uci", ["delete", `firewall.${name}`]);
    await this.exec("/sbin/uci", ["commit", "firewall"]);
    await this.exec("/etc/init.d/firewall", ["reload"]);
  }

  async setAccess(mac: string, grant: boolean): Promise<void> {
    const m = mac.toLowerCase();
    if (grant) {
      // admitir: autenticar en el portal cautivo y quitar cualquier corte
      await this.exec("/usr/bin/ndsctl", ["auth", m]).catch(() => {});
      await this.removeBlock(m).catch(() => {});
    } else {
      // dejar/echar en cuarentena
      await this.exec("/usr/bin/ndsctl", ["deauth", m]).catch(() => {});
    }
  }

  async toggleRule(): Promise<void> {
    // Bloqueo de webs/apps por dominio: se recomienda combinar con AdGuard Home
    // (DNS) o reglas dnsmasq. Punto de extensión documentado en el README.
  }

  async toggleSchedule(): Promise<void> {
    // Horarios: cron + reglas de firewall programadas. Punto de extensión.
  }

  async runSpeedTest(): Promise<{ downMbps: number; upMbps: number; pingMs: number }> {
    try {
      const out = await this.exec("/usr/bin/speedtest-netperf.sh", []);
      const down = Number(/Download:\s*([\d.]+)/i.exec(out)?.[1] ?? 0);
      const up = Number(/Upload:\s*([\d.]+)/i.exec(out)?.[1] ?? 0);
      const ping = Number(/Latency:\s*([\d.]+)/i.exec(out)?.[1] ?? 0);
      return { downMbps: down, upMbps: up, pingMs: ping };
    } catch {
      return { downMbps: 0, upMbps: 0, pingMs: 0 };
    }
  }
}
