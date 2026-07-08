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
  async runSpeedTest() {
    return { downMbps: 305 + Math.round(Math.random() * 40), upMbps: 38 + Math.round(Math.random() * 8), pingMs: 10 + Math.round(Math.random() * 6) };
  }
}

let instance: NetworkBackend | null = null;

/** Selecciona el backend. Hoy: demo. Mañana: según env NETCONTROL_BACKEND. */
export function getBackend(): NetworkBackend {
  if (!instance) {
    // const kind = process.env.NETCONTROL_BACKEND;
    // switch (kind) { case "pihole": instance = new PiholeBackend(...); break; ... }
    instance = new DemoBackend();
  }
  return instance;
}
