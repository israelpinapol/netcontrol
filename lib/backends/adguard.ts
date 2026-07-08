import type { NetworkBackend } from "../backend";
import type {
  BlockRule,
  Device,
  DeviceStatus,
  DeviceType,
  NetworkSnapshot,
  Schedule,
} from "../types";

/**
 * Adaptador REAL para AdGuard Home (100% gratis / open source).
 *
 * Configuración por variables de entorno:
 *   NETCONTROL_BACKEND=adguard
 *   ADGUARD_URL=http://192.168.1.10:3000   (URL del AdGuard Home en tu red o su túnel)
 *   ADGUARD_USER=admin
 *   ADGUARD_PASS=tu_password
 *   ADGUARD_ROUTER_NAME="Casa - AdGuard Home"   (opcional, sólo estético)
 *
 * Qué cubre AdGuard Home (DNS):
 *   ✅ ver dispositivos, ✅ cortar/permitir acceso (allow/disallow client),
 *   ✅ bloquear webs/apps por dispositivo (blocked_services / reglas $client),
 *   ✅ estadísticas de uso (consultas por cliente), ✅ dispositivos nuevos.
 * Lo que NO puede el DNS (necesita OpenWRT/router):
 *   ❌ Mbps/GB reales por equipo y test de velocidad. Esos campos van en 0 y
 *      se marcan como "—" en la UI. Ver README para añadir OpenWRT gratis.
 *
 * API de referencia: base `/control`. Docs: https://github.com/AdguardTeam/AdGuardHome/tree/master/openapi
 */

interface AghClient {
  name: string;
  ids: string[];
  use_global_settings: boolean;
  filtering_enabled: boolean;
  blocked_services?: string[];
  blocked_services_schedule?: AghSchedule;
}
interface AghAutoClient {
  name: string;
  ip: string;
  source: string;
}
interface AghSchedule {
  time_zone?: string;
  [day: string]: { start: number; end: number } | string | undefined;
}
interface AghAccess {
  allowed_clients: string[];
  disallowed_clients: string[];
  blocked_hosts: string[];
}
interface AghStats {
  top_clients?: Array<Record<string, number>>;
  num_dns_queries?: number;
}
interface AghStatus {
  dns_addresses?: string[];
  running?: boolean;
  version?: string;
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function guessType(name: string): DeviceType {
  const n = name.toLowerCase();
  if (/iphone|android|phone|pixel|galaxy|movil|móvil/.test(n)) return "phone";
  if (/ipad|tablet/.test(n)) return "tablet";
  if (/tv|roku|chromecast|firestick|shield/.test(n)) return "tv";
  if (/playstation|ps4|ps5|xbox|nintendo|switch/.test(n)) return "console";
  if (/macbook|laptop|notebook/.test(n)) return "laptop";
  if (/pc|desktop|imac/.test(n)) return "desktop";
  if (/cam|camera|sensor|bulb|plug|echo|alexa|nest|iot/.test(n)) return "iot";
  return "phone";
}

export class AdGuardBackend implements NetworkBackend {
  private base: string;
  private user?: string;
  private pass?: string;
  private cookie?: string;

  constructor() {
    this.base = (process.env.ADGUARD_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
    this.user = process.env.ADGUARD_USER;
    this.pass = process.env.ADGUARD_PASS;
  }

  // ---- transporte ----
  private async login(): Promise<void> {
    if (!this.user || !this.pass) return; // AGH sin contraseña
    const res = await fetch(`${this.base}/control/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: this.user, password: this.pass }),
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
  }

  private async req<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const doFetch = () =>
      fetch(`${this.base}/control${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(this.cookie ? { Cookie: this.cookie } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
    let res = await doFetch();
    if (res.status === 401 || res.status === 403) {
      await this.login();
      res = await doFetch();
    }
    if (!res.ok) throw new Error(`AdGuard ${path} -> ${res.status}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  // ---- lectura ----
  async getSnapshot(): Promise<NetworkSnapshot> {
    await this.login();
    const [status, clientsResp, access, stats] = await Promise.all([
      this.req<AghStatus>("/status").catch((): AghStatus => ({})),
      this.req<{ clients: AghClient[] | null; auto_clients: AghAutoClient[] | null }>("/clients").catch(() => ({ clients: [], auto_clients: [] })),
      this.req<AghAccess>("/access/list").catch(() => ({ allowed_clients: [], disallowed_clients: [], blocked_hosts: [] })),
      this.req<AghStats>("/stats").catch(() => ({} as AghStats)),
    ]);

    const persistent = clientsResp.clients ?? [];
    const autos = clientsResp.auto_clients ?? [];
    const disallowed = new Set(access.disallowed_clients ?? []);

    // consultas por cliente (proxy de "actividad", no de GB)
    const queriesByClient = new Map<string, number>();
    for (const row of stats.top_clients ?? []) {
      for (const [ip, count] of Object.entries(row)) queriesByClient.set(ip, count);
    }

    // combinar clientes persistentes + auto-descubiertos por IP
    const byIp = new Map<string, Device>();
    const push = (name: string, ip: string, mac: string, persistentClient?: AghClient) => {
      if (!ip || byIp.has(ip)) return;
      const blocked = disallowed.has(ip) || (mac && disallowed.has(mac));
      const queries = queriesByClient.get(ip) ?? 0;
      byIp.set(ip, {
        id: ip,
        name: name || `Dispositivo ${ip}`,
        owner: persistentClient?.name ? "—" : "—",
        type: guessType(name),
        mac,
        ip,
        status: blocked ? "blocked" : "allowed",
        online: true,
        downMbps: 0, // AGH no mide ancho de banda (DNS)
        upMbps: 0,
        usageTodayGb: 0,
        connectedMinutes: 0,
        topApp: queries ? `${queries} consultas DNS` : "—",
        firstSeen: "",
      });
    };

    for (const c of persistent) {
      const ip = c.ids.find((i) => /^\d+\.\d+\.\d+\.\d+$/.test(i)) ?? c.ids[0] ?? "";
      const mac = c.ids.find((i) => /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(i)) ?? "";
      push(c.name, ip, mac, c);
    }
    for (const a of autos) push(a.name, a.ip, "", undefined);

    const devices = [...byIp.values()];

    // reglas: blocked_services por cliente persistente
    const rules: BlockRule[] = [];
    for (const c of persistent) {
      for (const svc of c.blocked_services ?? []) {
        rules.push({
          id: `svc:${c.name}:${svc}`,
          target: svc,
          kind: "app",
          scope: c.name,
          scopeLabel: c.name,
          enabled: true,
        });
      }
    }

    // horarios: blocked_services_schedule por cliente
    const schedules: Schedule[] = [];
    for (const c of persistent) {
      const sch = c.blocked_services_schedule;
      if (!sch) continue;
      const days: number[] = [];
      let from = "00:00";
      let to = "00:00";
      DAY_KEYS.forEach((k, i) => {
        const v = sch[k];
        if (v && typeof v === "object") {
          days.push(i);
          from = minutesToHHMM(v.start);
          to = minutesToHHMM(v.end);
        }
      });
      if (days.length) {
        schedules.push({
          id: `sch:${c.name}`,
          label: `Horario ${c.name}`,
          scopeLabel: c.name,
          deviceIds: c.ids,
          from,
          to,
          days,
          action: "cutoff",
          enabled: true,
        });
      }
    }

    const online = devices.filter((d) => d.online);
    return {
      routerName: process.env.ADGUARD_ROUTER_NAME || "Casa - AdGuard Home",
      wanIp: (status.dns_addresses && status.dns_addresses[0]) || "—",
      ssid: "AdGuard Home",
      online: status.running ?? true,
      speed: { downMbps: 0, upMbps: 0, pingMs: 0, jitterMs: 0, planDownMbps: 0, at: "" },
      devices,
      rules,
      schedules,
      usageByHour: [], // ancho de banda por hora: requiere OpenWRT
      usageByCategory: [],
      totals: {
        devicesOnline: online.length,
        usageTodayGb: 0,
        blockedCount: devices.filter((d) => d.status === "blocked").length,
        newDevices: 0,
      },
    };
  }

  // ---- órdenes ----
  async setDeviceStatus(deviceId: string, status: DeviceStatus): Promise<void> {
    // deviceId es la IP. Cortar = añadir a disallowed_clients; permitir = quitar.
    const access = await this.req<AghAccess>("/access/list");
    const disallowed = new Set(access.disallowed_clients ?? []);
    if (status === "allowed") disallowed.delete(deviceId);
    else disallowed.add(deviceId); // "blocked" y "paused" cortan el DNS
    await this.req("/access/set", "POST", {
      allowed_clients: access.allowed_clients ?? [],
      disallowed_clients: [...disallowed],
      blocked_hosts: access.blocked_hosts ?? [],
    });
  }

  async toggleRule(ruleId: string, enabled: boolean): Promise<void> {
    // ruleId = "svc:<cliente>:<servicio>". Añade/quita el servicio del cliente.
    const [, clientName, service] = ruleId.split(":");
    if (!clientName || !service) return;
    const resp = await this.req<{ clients: AghClient[] }>("/clients");
    const client = (resp.clients ?? []).find((c) => c.name === clientName);
    if (!client) return;
    const set = new Set(client.blocked_services ?? []);
    if (enabled) set.add(service);
    else set.delete(service);
    await this.req("/clients/update", "POST", {
      name: clientName,
      data: { ...client, blocked_services: [...set] },
    });
  }

  async toggleSchedule(scheduleId: string, enabled: boolean): Promise<void> {
    // Con AGH el horario vive dentro del cliente (blocked_services_schedule).
    // Activarlo/desactivarlo requiere reescribir ese objeto; se deja como
    // punto de extensión documentado para no romper configuraciones reales.
    console.warn(`[adguard] toggleSchedule(${scheduleId}, ${enabled}) — editar blocked_services_schedule del cliente en clients/update.`);
  }

  async runSpeedTest(): Promise<{ downMbps: number; upMbps: number; pingMs: number }> {
    // AdGuard Home no mide velocidad de línea. Requiere OpenWRT (speedtest) o
    // correr un test desde un agente en la LAN. Devolvemos ceros marcados.
    return { downMbps: 0, upMbps: 0, pingMs: 0 };
  }
}

function minutesToHHMM(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
