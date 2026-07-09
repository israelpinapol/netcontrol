import type { NetworkBackend } from "../backend";
import type { DeviceStatus, NetworkSnapshot } from "../types";

/**
 * Adaptador para el AGENTE NetControl (agent/netcontrol-agent.mjs).
 *
 * Este es el backend de la PLATAFORMA PÚBLICA: funciona con CUALQUIER
 * router/módem porque el control lo hace un agente que corre en la red del
 * usuario y descubre/controla equipos por ARP (sin API del router). El panel
 * solo habla con el agente (directo en la LAN o vía túnel Cloudflare/Tailscale).
 *
 * Config:
 *   NETCONTROL_BACKEND=agent
 *   AGENT_URL=http://127.0.0.1:4000     (o la URL del túnel del agente)
 *   AGENT_TOKEN=<secreto>               (opcional, debe coincidir con el agente)
 *
 * El agente ya devuelve el snapshot en el shape de NetworkSnapshot.
 */
export class AgentBackend implements NetworkBackend {
  private base: string;
  private token?: string;

  constructor() {
    this.base = (process.env.AGENT_URL || "http://127.0.0.1:4000").replace(/\/$/, "");
    this.token = process.env.AGENT_TOKEN;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    };
  }

  private async post(path: string, body: unknown): Promise<void> {
    await fetch(`${this.base}${path}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      cache: "no-store",
    });
  }

  async getSnapshot(): Promise<NetworkSnapshot> {
    const res = await fetch(`${this.base}/snapshot`, { headers: this.headers(), cache: "no-store" });
    if (!res.ok) throw new Error(`agente /snapshot -> ${res.status}`);
    return (await res.json()) as NetworkSnapshot;
  }

  async setDeviceStatus(deviceId: string, status: DeviceStatus): Promise<void> {
    // deviceId = MAC del dispositivo
    await this.post("/device", { mac: deviceId, status });
  }

  async setAccess(mac: string, grant: boolean): Promise<void> {
    await this.post("/access", { mac, grant });
  }

  async toggleRule(): Promise<void> {
    // Bloqueo de webs/apps por contenido: combinar con AdGuard Home (DNS).
    // El agente v1 controla admisión y corte de red, no filtrado de dominios.
  }

  async toggleSchedule(): Promise<void> {
    // Horarios: previsto en el agente (cron + enforcement). Punto de extensión.
  }

  async runSpeedTest(): Promise<{ downMbps: number; upMbps: number; pingMs: number }> {
    return { downMbps: 0, upMbps: 0, pingMs: 0 };
  }
}
