#!/usr/bin/env node
// NetControl Agent — corre en la red del usuario (cualquier router/módem).
// Descubre dispositivos por ARP y mide datos REALES (fabricante, latencia,
// estado, ancho de banda de la línea). El corte real de un equipo se hace por
// ARP (necesita ejecutar el agente con `sudo`). Sin dependencias: solo Node.
//
// Uso:
//   node agent/netcontrol-agent.mjs          (ver + descubrir, sin corte real)
//   sudo node agent/netcontrol-agent.mjs      (además CORTA de verdad por ARP)
//
// Env: AGENT_PORT=4000  AGENT_TOKEN=<secreto>  ROUTER_NAME="Casa"

import http from "node:http";
import os from "node:os";
import { exec as _exec, spawn } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const exec = promisify(_exec);
const PORT = Number(process.env.AGENT_PORT || 4000);
const TOKEN = process.env.AGENT_TOKEN || "";
const ROUTER_NAME = process.env.ROUTER_NAME || "Casa - Agente NetControl";
// Modo control de acceso (cuarentena de nuevos). Por defecto APAGADO: se ven
// TODOS los dispositivos de una. Con AGENT_NAC=1 los nuevos entran en cuarentena.
const NAC = process.env.AGENT_NAC === "1";
const __dir = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dir, "agent-state.json");
const ARP_CUT = path.join(__dir, "arp-cut.py");
const IS_ROOT = typeof process.getuid === "function" && process.getuid() === 0;

/* ---- fabricantes por OUI (prefijo del MAC) — subconjunto común ---- */
const OUI = {
  "a4:83:e7": "Apple", "f0:18:98": "Apple", "5c:af:06": "Apple", "3c:22:fb": "Apple",
  "dc:a9:04": "Apple", "a8:5c:2c": "Apple", "bc:d0:74": "Apple", "88:66:5a": "Apple",
  "ac:bc:32": "Apple", "f0:99:bf": "Apple", "d0:81:7a": "Apple", "9c:fc:01": "Apple",
  "5c:0a:5b": "Samsung", "e8:50:8b": "Samsung", "78:1f:db": "Samsung", "8c:77:12": "Samsung",
  "1c:f2:9a": "Google", "f4:f5:d8": "Google", "da:a1:19": "Google", "3c:5a:b4": "Google",
  "68:37:e9": "Amazon", "fc:65:de": "Amazon", "44:65:0d": "Amazon", "50:dc:e7": "Amazon",
  "34:41:5d": "Intel", "3c:a6:f6": "Intel", "e4:5f:01": "Raspberry Pi", "b8:27:eb": "Raspberry Pi",
  "dc:a6:32": "Raspberry Pi", "50:c7:bf": "TP-Link", "b0:be:76": "TP-Link", "c0:06:c3": "TP-Link",
  "78:c8:81": "Sony", "00:d9:d1": "Sony", "7c:1e:52": "Microsoft", "00:50:f2": "Microsoft",
  "d8:3a:dd": "Raspberry Pi", "2c:cf:67": "Raspberry Pi",
};
function vendorOf(mac) { return OUI[mac.slice(0, 8)] || ""; }
function isRandomMac(mac) {
  const first = parseInt(mac.slice(0, 2), 16);
  return Number.isFinite(first) && (first & 0x02) !== 0; // bit "localmente administrado"
}

/* ---- estado persistente ---- */
function loadState() {
  try { return JSON.parse(readFileSync(STATE_FILE, "utf8")); }
  catch { return { approved: {}, blocked: {}, known: {} }; }
}
function saveState(s) { try { writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); } catch {} }
let state = loadState();

/* ---- red local ---- */
function activeIface() {
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === "IPv4" && !a.internal) return { name, ip: a.address, netmask: a.netmask, mac: (a.mac || "").toLowerCase() };
    }
  }
  return null;
}
async function gatewayIp() {
  try {
    const { stdout } = await exec("route -n get default 2>/dev/null || ip route show default 2>/dev/null");
    const m = stdout.match(/gateway:\s*([\d.]+)/) || stdout.match(/default via ([\d.]+)/);
    return m ? m[1] : "";
  } catch { return ""; }
}
function ipsInSubnet(ip, netmask) {
  const toInt = (s) => s.split(".").reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
  const toIp = (n) => [24, 16, 8, 0].map((sh) => (n >>> sh) & 255).join(".");
  const net = toInt(ip) & toInt(netmask);
  const bcast = net | (~toInt(netmask) >>> 0);
  const out = [];
  for (let n = net + 1; n < bcast && out.length < 512; n++) out.push(toIp(n));
  return out;
}

/* ---- ping: descubre + mide latencia REAL ---- */
async function pingHost(ip) {
  try {
    const { stdout } = await exec(`ping -c1 -t1 -W900 ${ip} 2>/dev/null`);
    const m = stdout.match(/time[=<]\s*([\d.]+)\s*ms/);
    return m ? Math.round(Number(m[1]) * 10) / 10 : 0.1; // respondió
  } catch { return null; } // sin respuesta
}
async function pingSweep(ips) {
  const rtt = new Map();
  const batch = 48;
  for (let i = 0; i < ips.length; i += batch) {
    await Promise.all(ips.slice(i, i + batch).map(async (ip) => {
      const ms = await pingHost(ip);
      if (ms !== null) rtt.set(ip, ms);
    }));
  }
  return rtt;
}
async function readArp() {
  const { stdout } = await exec("arp -an");
  const rows = [];
  for (const line of stdout.split("\n")) {
    const m = line.match(/\(([\d.]+)\) at ([0-9a-f:]{11,17})/i);
    if (!m) continue;
    const ip = m[1];
    const mac = m[2].toLowerCase().split(":").map((h) => h.padStart(2, "0")).join(":");
    const first = Number(ip.split(".")[0]);
    if (mac === "ff:ff:ff:ff:ff:ff" || ip.endsWith(".255") || first >= 224) continue;
    if (mac.startsWith("01:00:5e") || mac.startsWith("33:33")) continue;
    rows.push({ ip, mac });
  }
  return rows;
}
async function rdns(ip) {
  try {
    const { stdout } = await exec(`dscacheutil -q host -a ip_address ${ip} 2>/dev/null || true`);
    const m = stdout.match(/^name:\s*(\S+)/m);
    return m ? m[1].split(".")[0] : "";
  } catch { return ""; }
}

/* ---- ancho de banda REAL de la línea (netstat delta) ---- */
let lastBW = null; // {bytesIn, bytesOut, t}
let peakDown = 1;
async function lineBandwidth(iface) {
  try {
    const { stdout } = await exec(`netstat -ibn -I ${iface} 2>/dev/null`);
    const line = stdout.split("\n").find((l) => l.startsWith(iface) && /\d{4,}/.test(l));
    if (!line) return { downMbps: 0, upMbps: 0 };
    const f = line.trim().split(/\s+/);
    // columnas: Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes ...
    const ibytes = Number(f[6]); const obytes = Number(f[9]);
    const now = Date.now();
    let down = 0, up = 0;
    if (lastBW && ibytes >= lastBW.bytesIn) {
      const dt = (now - lastBW.t) / 1000;
      if (dt > 0.5) {
        down = ((ibytes - lastBW.bytesIn) * 8) / dt / 1e6;
        up = ((obytes - lastBW.bytesOut) * 8) / dt / 1e6;
      }
    }
    lastBW = { bytesIn: ibytes, bytesOut: obytes, t: now };
    down = Math.round(down * 10) / 10; up = Math.round(up * 10) / 10;
    peakDown = Math.max(peakDown, down, 1);
    return { downMbps: down, upMbps: up };
  } catch { return { downMbps: 0, upMbps: 0 }; }
}

/* ---- ENFORCEMENT real: ARP-cut por MAC (requiere root) ---- */
const cutProcs = new Map(); // mac -> child process
function pythonBin() { return existsSync("/usr/bin/python3") ? "/usr/bin/python3" : "python3"; }
function startCut(ifc, gw, ip, mac) {
  if (!IS_ROOT || cutProcs.has(mac) || !existsSync(ARP_CUT)) return;
  const p = spawn(pythonBin(), [ARP_CUT, ifc.name, ifc.mac, gw, ip, mac], { stdio: "ignore" });
  cutProcs.set(mac, p);
  p.on("exit", () => cutProcs.delete(mac));
  console.log(`[cut] ARP-cut ACTIVO sobre ${ip} (${mac})`);
}
function stopCut(mac) {
  const p = cutProcs.get(mac);
  if (p) { try { p.kill("SIGTERM"); } catch {} cutProcs.delete(mac); console.log(`[cut] restaurado ${mac}`); }
}

/* ---- descubrimiento + snapshot ---- */
function guessType(name, vendor) {
  const n = `${name} ${vendor}`.toLowerCase();
  if (/iphone|android|phone|pixel|galaxy|samsung/.test(n)) return "phone";
  if (/ipad|tablet/.test(n)) return "tablet";
  if (/tv|roku|chromecast|firestick|google/.test(n)) return "tv";
  if (/playstation|ps4|ps5|xbox|nintendo|switch|sony/.test(n)) return "console";
  if (/macbook|laptop/.test(n)) return "laptop";
  if (/imac|pc|desktop|intel|microsoft/.test(n)) return "desktop";
  if (/raspberry|amazon|echo|nest|cam|iot/.test(n)) return "iot";
  return "phone";
}

async function buildSnapshot() {
  const ifc = activeIface();
  if (!ifc) return emptySnapshot();
  const gw = await gatewayIp();
  const rtt = await pingSweep(ipsInSubnet(ifc.ip, ifc.netmask));
  const arp = await readArp();
  if (!arp.find((r) => r.ip === ifc.ip)) arp.push({ ip: ifc.ip, mac: ifc.mac });

  const bw = await lineBandwidth(ifc.name);
  const now = new Date().toISOString();
  const devices = [];
  const requests = [];

  for (const r of arp) {
    const mac = r.mac;
    const isGw = r.ip === gw;
    const isSelf = r.ip === ifc.ip;
    if (!state.known[mac]) state.known[mac] = now;
    const vendor = vendorOf(mac);
    const host = await rdns(r.ip);
    const ms = rtt.get(r.ip);
    const online = ms !== undefined || isSelf;

    let name = host || vendor;
    if (isGw) name = "Router / Módem";
    else if (isSelf) name = "Este equipo (agente)";
    else if (!name) name = isRandomMac(mac) ? "Dispositivo privado" : `Dispositivo ${r.ip}`;

    const isApproved = state.approved[mac] || isGw || isSelf;
    const isBlocked = !!state.blocked[mac];

    // Sólo en modo NAC los dispositivos nuevos se ocultan en cuarentena.
    // Por defecto (sin NAC) TODOS se muestran en la lista.
    if (NAC && !isApproved && !isBlocked) {
      requests.push({ mac, ip: r.ip, name: name.startsWith("Dispositivo ") ? "Dispositivo nuevo" : name, since: state.known[mac] });
      continue;
    }
    devices.push({
      id: mac,
      name,
      owner: vendor || (isRandomMac(mac) ? "MAC privada" : "—"),
      type: guessType(name, vendor),
      mac,
      ip: r.ip,
      status: isBlocked ? "blocked" : "allowed",
      online,
      downMbps: 0,
      upMbps: 0,
      usageTodayGb: 0,
      connectedMinutes: 0,
      topApp: isBlocked ? "cortado" : online ? (ms !== undefined ? `${ms} ms` : "activo") : "sin respuesta",
      firstSeen: state.known[mac] || "",
    });
  }
  saveState(state);

  const enforce = IS_ROOT ? "ARP real" : "solo marca (sin sudo)";
  return {
    routerName: `${ROUTER_NAME} · corte: ${enforce}`,
    wanIp: gw || "—",
    ssid: ifc.name,
    online: true,
    speed: { downMbps: bw.downMbps, upMbps: bw.upMbps, pingMs: Math.round(rtt.get(gw) || 0), jitterMs: 0, planDownMbps: Math.ceil(peakDown / 10) * 10 || 100, at: now },
    devices,
    rules: [],
    schedules: [],
    usageByHour: [],
    usageByCategory: [],
    accessRequests: requests,
    totals: {
      devicesOnline: devices.filter((d) => d.online).length,
      usageTodayGb: 0,
      blockedCount: devices.filter((d) => d.status === "blocked").length,
      newDevices: requests.length,
    },
  };
}
function emptySnapshot() {
  return {
    routerName: ROUTER_NAME, wanIp: "—", ssid: "LAN", online: false,
    speed: { downMbps: 0, upMbps: 0, pingMs: 0, jitterMs: 0, planDownMbps: 100, at: "" },
    devices: [], rules: [], schedules: [], usageByHour: [], usageByCategory: [], accessRequests: [],
    totals: { devicesOnline: 0, usageTodayGb: 0, blockedCount: 0, newDevices: 0 },
  };
}

/* ---- aplica el corte según el estado (arranca/para ARP-cut) ---- */
async function applyEnforcement() {
  const ifc = activeIface();
  const gw = await gatewayIp();
  if (!ifc || !gw) return;
  if (!IS_ROOT) {
    const n = Object.keys(state.blocked).length;
    if (n) console.warn(`[cut] ${n} equipo(s) marcados, pero el agente NO corre como root: corte real inactivo. Usa 'sudo node agent/netcontrol-agent.mjs'.`);
    return;
  }
  for (const mac of Object.keys(state.blocked)) {
    const dev = cachedRaw.get(mac);
    if (dev) startCut(ifc, gw, dev.ip, mac);
  }
  for (const mac of cutProcs.keys()) if (!state.blocked[mac]) stopCut(mac);
}

/* ---- cache de escaneo ---- */
let cachedSnapshot = null;
let cachedRaw = new Map(); // mac -> {ip}
let scanning = false;
async function refreshSnapshot() {
  if (scanning) return;
  scanning = true;
  try {
    cachedSnapshot = await buildSnapshot();
    cachedRaw = new Map((cachedSnapshot.devices || []).map((d) => [d.mac, { ip: d.ip }]));
    await applyEnforcement();
  } catch (e) { console.warn("[scan]", e?.message || e); }
  scanning = false;
}

/* ---- API HTTP ---- */
function send(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(body));
}
function auth(req) { return !TOKEN || req.headers["authorization"] === `Bearer ${TOKEN}`; }
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch { return {}; }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (!auth(req)) return send(res, 401, { error: "token inválido" });
  try {
    if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true, root: IS_ROOT });
    if (req.method === "GET" && req.url === "/snapshot") {
      if (!cachedSnapshot) await refreshSnapshot(); else refreshSnapshot();
      return send(res, 200, cachedSnapshot);
    }
    if (req.method === "POST" && req.url === "/device") {
      const { mac, status } = await readBody(req);
      if (!mac) return send(res, 400, { error: "mac requerido" });
      if (status === "allowed") { delete state.blocked[mac]; state.approved[mac] = true; }
      else state.blocked[mac] = true;
      saveState(state); await applyEnforcement();
      return send(res, 200, { ok: true, root: IS_ROOT });
    }
    if (req.method === "POST" && req.url === "/access") {
      const { mac, grant } = await readBody(req);
      if (!mac) return send(res, 400, { error: "mac requerido" });
      if (grant) { state.approved[mac] = true; delete state.blocked[mac]; }
      else state.blocked[mac] = true;
      saveState(state); await applyEnforcement();
      return send(res, 200, { ok: true, root: IS_ROOT });
    }
    return send(res, 404, { error: "no encontrado" });
  } catch (e) { return send(res, 500, { error: String(e?.message || e) }); }
});

function cleanup() { for (const mac of cutProcs.keys()) stopCut(mac); process.exit(0); }
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

server.listen(PORT, () => {
  const ifc = activeIface();
  console.log(`NetControl Agent en http://127.0.0.1:${PORT}`);
  console.log(`Interfaz: ${ifc?.name} ${ifc?.ip}  ·  root(corte real): ${IS_ROOT ? "SÍ" : "NO — usa sudo"}`);
  refreshSnapshot();
  setInterval(refreshSnapshot, 15000);
});
