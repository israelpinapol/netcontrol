import type { NetworkSnapshot } from "./types";
import { buildSnapshot } from "./mockData";

/**
 * Contrato que cualquier backend de red debe cumplir.
 *
 * El panel (frontend) SOLO conoce esta interfaz. Para conectar un agente real
 * en tu casa (Pi-hole, OpenWRT, UniFi, MikroTik, Firewalla...) basta con crear
 * una clase que implemente `NetworkBackend` y apuntarla al túnel seguro del
 * agente local. El resto de la app no cambia.
 */
export interface NetworkBackend {
  getSnapshot(): Promise<NetworkSnapshot>;
  setDeviceStatus(deviceId: string, status: "allowed" | "blocked" | "paused"): Promise<void>;
  toggleRule(ruleId: string, enabled: boolean): Promise<void>;
  toggleSchedule(scheduleId: string, enabled: boolean): Promise<void>;
  runSpeedTest(): Promise<{ downMbps: number; upMbps: number; pingMs: number }>;
  /**
   * Admisión a la red (NAC / portal cautivo). `grant=true` da acceso al MAC;
   * `grant=false` lo deja/echa en cuarentena. Solo backends que controlan el
   * gateway (OpenWRT) lo aplican de verdad.
   */
  setAccess(mac: string, grant: boolean): Promise<void>;
}

/**
 * Implementación DEMO: datos simulados en memoria. Sustituir por el adaptador
 * real cuando exista el agente local. Ver README para el mapeo de cada método
 * a Pi-hole / OpenWRT / UniFi / MikroTik / Firewalla.
 */
class DemoBackend implements NetworkBackend {
  async getSnapshot(): Promise<NetworkSnapshot> {
    return buildSnapshot();
  }
  async setDeviceStatus(): Promise<void> {
    // no-op en demo (el estado se maneja en el cliente)
  }
  async toggleRule(): Promise<void> {}
  async toggleSchedule(): Promise<void> {}
  async setAccess(): Promise<void> {}
  async runSpeedTest() {
    return { downMbps: 305 + Math.round(Math.random() * 40), upMbps: 38 + Math.round(Math.random() * 8), pingMs: 10 + Math.round(Math.random() * 6) };
  }
}

let instance: NetworkBackend | null = null;

/**
 * Selecciona el backend según la variable de entorno NETCONTROL_BACKEND.
 *   (sin valor) | "demo" -> datos simulados (por defecto)
 *   "adguard"            -> AdGuard Home real (ver lib/backends/adguard.ts)
 *   "openwrt"            -> OpenWRT real: control de gateway + portal cautivo (ver lib/backends/openwrt.ts)
 */
export function getBackend(): NetworkBackend {
  if (!instance) {
    const kind = (process.env.NETCONTROL_BACKEND || "demo").toLowerCase();
    switch (kind) {
      case "adguard": {
        // import perezoso: sólo se carga si se usa este backend
        const { AdGuardBackend } = require("./backends/adguard") as typeof import("./backends/adguard");
        instance = new AdGuardBackend();
        break;
      }
      case "openwrt": {
        const { OpenWrtBackend } = require("./backends/openwrt") as typeof import("./backends/openwrt");
        instance = new OpenWrtBackend();
        break;
      }
      // case "pihole":  instance = new PiholeBackend();  break;
      default:
        instance = new DemoBackend();
    }
  }
  return instance;
}
