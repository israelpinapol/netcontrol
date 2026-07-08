// Modelos de dominio del panel. Son agnósticos del backend real:
// el mismo shape lo puede rellenar el adaptador demo, Pi-hole, OpenWRT,
// UniFi, MikroTik o Firewalla.

export type DeviceType = "phone" | "laptop" | "tv" | "console" | "iot" | "tablet" | "desktop";

export type DeviceStatus = "allowed" | "blocked" | "paused";

export interface Device {
  id: string;
  name: string;
  owner: string;
  type: DeviceType;
  mac: string;
  ip: string;
  status: DeviceStatus;
  online: boolean;
  /** Mbps en tiempo (casi) real */
  downMbps: number;
  upMbps: number;
  /** consumo del día en GB */
  usageTodayGb: number;
  /** minutos conectado hoy */
  connectedMinutes: number;
  /** app/categoría donde más gasta datos */
  topApp: string;
  isNew?: boolean;
  firstSeen: string; // ISO
}

export interface BlockRule {
  id: string;
  target: string; // dominio o app: youtube.com, TikTok...
  kind: "site" | "app" | "category";
  scope: "all" | string; // "all" o deviceId
  scopeLabel: string;
  enabled: boolean;
}

export interface Schedule {
  id: string;
  label: string;
  scopeLabel: string;
  deviceIds: string[];
  /** "22:00" */
  from: string;
  to: string;
  days: number[]; // 0=Dom ... 6=Sab
  action: "cutoff" | "slowdown";
  enabled: boolean;
}

export interface SpeedSample {
  downMbps: number;
  upMbps: number;
  pingMs: number;
  jitterMs: number;
  planDownMbps: number;
  at: string; // ISO
}

export interface UsagePoint {
  hour: string; // "08:00"
  gb: number;
}

export interface CategoryUsage {
  label: string;
  gb: number;
  color: string;
}

export interface NetworkSnapshot {
  routerName: string;
  wanIp: string;
  ssid: string;
  online: boolean;
  speed: SpeedSample;
  devices: Device[];
  rules: BlockRule[];
  schedules: Schedule[];
  usageByHour: UsagePoint[];
  usageByCategory: CategoryUsage[];
  totals: {
    devicesOnline: number;
    usageTodayGb: number;
    blockedCount: number;
    newDevices: number;
  };
}
