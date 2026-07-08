import type {
  AccessRequest,
  BlockRule,
  CategoryUsage,
  Device,
  NetworkSnapshot,
  Schedule,
  SpeedSample,
  UsagePoint,
} from "./types";

const devices: Device[] = [
  {
    id: "d1", name: "iPhone de Israel", owner: "Israel", type: "phone",
    mac: "A4:83:E7:1C:22:9F", ip: "192.168.1.12", status: "allowed", online: true,
    downMbps: 24.3, upMbps: 6.1, usageTodayGb: 3.2, connectedMinutes: 412,
    topApp: "Instagram", firstSeen: "2025-02-11T09:12:00Z",
  },
  {
    id: "d2", name: "MacBook Pro", owner: "Israel", type: "laptop",
    mac: "F0:18:98:44:1A:0B", ip: "192.168.1.20", status: "allowed", online: true,
    downMbps: 88.7, upMbps: 21.4, usageTodayGb: 9.7, connectedMinutes: 520,
    topApp: "YouTube / Trabajo", firstSeen: "2025-01-03T14:02:00Z",
  },
  {
    id: "d3", name: "Smart TV Sala", owner: "Familia", type: "tv",
    mac: "5C:AF:06:9B:77:31", ip: "192.168.1.31", status: "allowed", online: true,
    downMbps: 41.9, upMbps: 1.2, usageTodayGb: 14.1, connectedMinutes: 300,
    topApp: "Netflix", firstSeen: "2024-11-20T20:40:00Z",
  },
  {
    id: "d4", name: "PlayStation 5", owner: "Hermano", type: "console",
    mac: "78:C8:81:2E:44:AA", ip: "192.168.1.44", status: "paused", online: true,
    downMbps: 0.4, upMbps: 0.1, usageTodayGb: 6.8, connectedMinutes: 190,
    topApp: "Fortnite", firstSeen: "2024-12-25T18:00:00Z",
  },
  {
    id: "d5", name: "Tablet Niños", owner: "Sofía", type: "tablet",
    mac: "3C:22:FB:10:9E:5C", ip: "192.168.1.52", status: "blocked", online: false,
    downMbps: 0, upMbps: 0, usageTodayGb: 1.1, connectedMinutes: 95,
    topApp: "TikTok", firstSeen: "2025-03-02T16:30:00Z",
  },
  {
    id: "d6", name: "Cámara Puerta", owner: "Casa", type: "iot",
    mac: "B0:4E:26:77:12:39", ip: "192.168.1.60", status: "allowed", online: true,
    downMbps: 0.3, upMbps: 2.8, usageTodayGb: 2.4, connectedMinutes: 720,
    topApp: "Cloud (backup)", firstSeen: "2024-10-10T11:00:00Z",
  },
  {
    id: "d7", name: "Dispositivo desconocido", owner: "—", type: "phone",
    mac: "9E:0C:D3:AB:55:71", ip: "192.168.1.77", status: "allowed", online: true,
    downMbps: 5.2, upMbps: 0.9, usageTodayGb: 0.3, connectedMinutes: 14,
    topApp: "—", isNew: true, firstSeen: "2026-07-08T13:41:00Z",
  },
];

const rules: BlockRule[] = [
  { id: "r1", target: "tiktok.com", kind: "app", scope: "d5", scopeLabel: "Tablet Niños", enabled: true },
  { id: "r2", target: "Categoría: Adultos", kind: "category", scope: "all", scopeLabel: "Toda la red", enabled: true },
  { id: "r3", target: "youtube.com", kind: "site", scope: "d5", scopeLabel: "Tablet Niños", enabled: false },
  { id: "r4", target: "epicgames.com", kind: "site", scope: "d4", scopeLabel: "PlayStation 5", enabled: true },
];

const schedules: Schedule[] = [
  {
    id: "s1", label: "Corte nocturno niños", scopeLabel: "Tablet Niños",
    deviceIds: ["d5"], from: "21:00", to: "07:00", days: [0, 1, 2, 3, 4, 5, 6],
    action: "cutoff", enabled: true,
  },
  {
    id: "s2", label: "Sin juegos entre semana", scopeLabel: "PlayStation 5",
    deviceIds: ["d4"], from: "08:00", to: "17:00", days: [1, 2, 3, 4, 5],
    action: "cutoff", enabled: true,
  },
  {
    id: "s3", label: "Prioridad trabajo", scopeLabel: "MacBook Pro",
    deviceIds: ["d2"], from: "09:00", to: "18:00", days: [1, 2, 3, 4, 5],
    action: "slowdown", enabled: false,
  },
];

const usageByHour: UsagePoint[] = [
  { hour: "00", gb: 1.2 }, { hour: "02", gb: 0.6 }, { hour: "04", gb: 0.3 },
  { hour: "06", gb: 0.9 }, { hour: "08", gb: 3.1 }, { hour: "10", gb: 4.4 },
  { hour: "12", gb: 5.2 }, { hour: "14", gb: 6.1 }, { hour: "16", gb: 7.8 },
  { hour: "18", gb: 9.3 }, { hour: "20", gb: 11.4 }, { hour: "22", gb: 8.2 },
];

const usageByCategory: CategoryUsage[] = [
  { label: "Streaming (Netflix, YT)", gb: 22.4, color: "#38e1c4" },
  { label: "Videojuegos", gb: 9.1, color: "#7c8cff" },
  { label: "Redes sociales", gb: 6.7, color: "#ffb84d" },
  { label: "Trabajo / Web", gb: 5.3, color: "#3ddc84" },
  { label: "Otros", gb: 3.0, color: "#ff5c72" },
];

const speed: SpeedSample = {
  downMbps: 312.5, upMbps: 41.8, pingMs: 12, jitterMs: 2,
  planDownMbps: 500, at: "2026-07-08T13:45:00Z",
};

const accessRequests: AccessRequest[] = [
  { mac: "AE:5F:22:0D:91:3C", ip: "192.168.1.90", name: "Samsung-Galaxy (invitado)", since: "2026-07-08T13:52:00Z" },
  { mac: "62:11:C8:74:2B:10", ip: "192.168.1.91", name: "Dispositivo desconocido", since: "2026-07-08T13:58:00Z" },
];

export function buildSnapshot(): NetworkSnapshot {
  const online = devices.filter((d) => d.online);
  return {
    routerName: "Casa - Router principal",
    wanIp: "189.203.44.117",
    ssid: "MiRed_5G",
    online: true,
    speed,
    devices,
    rules,
    schedules,
    usageByHour,
    usageByCategory,
    accessRequests,
    totals: {
      devicesOnline: online.length,
      usageTodayGb: Number(devices.reduce((a, d) => a + d.usageTodayGb, 0).toFixed(1)),
      blockedCount: devices.filter((d) => d.status === "blocked").length,
      newDevices: devices.filter((d) => d.isNew).length,
    },
  };
}
