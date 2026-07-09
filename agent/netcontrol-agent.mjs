#!/usr/bin/env node
// NetControl Agent — corre en la red del usuario (cualquier router/módem).
// Descubre dispositivos por ARP (universal, sin API del router) y expone una
// API local que el panel/plataforma consume. La aplicación real de "cortar"
// (enforcement) es un punto conectable: ARP-control con permisos, o API del
// router si existe. Sin dependencias: solo Node.
//
// Uso:   node agent/netcontrol-agent.mjs
// Env:   AGENT_PORT=4000  AGENT_TOKEN=<secreto opcional>  ROUTER_NAME="Casa"
//
// Endpoints:
//   GET  /snapshot            -> { routerName, gatewayIp, devices[], accessRequests[] }
//   POST /device  {mac,status}-> allowed | blocked | paused
//   POST /access  {mac,grant} -> admite (grant=true) o deja en cuarentena
//   GET  /health

import http from "node:http";
import os from "node:os";
import { exec as _exec } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const exec = promisify(_exec);
const PORT = Number(process.env.AGENT_PORT || 4000);
const TOKEN = process.env.AGENT_TOKEN || "";
const ROUTER_NAME = process.env.ROUTER_NAME || "Casa - Agente NetControl";
const __dir = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dir, "agent-state.json");

// ---- estado persistente (aprobados / bloqueados / conocidos) ----
function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { approved: {}, blocked: {}, known: {} }; // mac -> true / firstSeen
  }
}
function saveState(s) {
  try { writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); } catch {}
}
let state = loadState();

// ---- red local: interfaz activa, ip, máscara, gateway ----
function activeIface() {
  const ifaces = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const a of addrs || []) {
      if (a.family === "IPv4" && !a.internal) return { name, ip: a.address, netmask: a.netmask };
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

// ---- descubrimiento por ARP (universal) ----
async function pingSweep(ips) {
  // Poblar la tabla ARP mandando 1 ping corto a cada IP, en paralelo por lotes.
  const batch = 64;
  for (let i = 0; i < ips.length; i += batch) {
    await Promise.all(
      ips.slice(i, i + batch).map((ip) =>
        exec(`ping -c1 -t1 -W1 ${ip} >/dev/null 2>&1`).catch(() => {}),
      ),
    );
  }
}
async function readArp() {
  const { stdout } = await exec("arp -an");
  const rows = [];
  for (const line of stdout.split("\n")) {
    // ? (192.168.1.10) at a4:83:e7:1c:22:9f on en0 ...
    const m = line.match(/\(([\d.]+)\) at ([0-9a-f:]{11,17})/i);
    if (!m) continue;
    const ip = m[1];
    const mac = m[2].toLowerCase().split(":").map((h) => h.padStart(2, "0")).join(":");
    const first = Number(ip.split(".")[0]);
    // descarta broadcast y multicast (no son dispositivos reales)
    if (mac === "ff:ff:ff:ff:ff:ff" || ip.endsWith(".255") || first >= 224) continue;
    if (mac.startsWith("01:00:5e") || mac.startsWith("33:33")) continue;
    rows.push({ ip, mac });
  }
  return rows;
}
async function rdns(ip) {
  try {
    const { stdout } = await exec(`dscacheutil -q host -a ip_address ${ip} 2>/dev/null || true`);
    const m = stdout.match(/name:\s*(\S+)/);
    return m ? m[1].split(".")[0] : "";
  } catch { return ""; }
}

async function discover() {
  const ifc = activeIface();
  if (!ifc) return { gateway: "", devices: [] };
  const gw = await gatewayIp();
  await pingSweep(ipsInSubnet(ifc.ip, ifc.netmask));
  const arp = await readArp();
  // añadir el propio equipo
  if (!arp.find((r) => r.ip === ifc.ip)) {
    const selfMac = (os.networkInterfaces()[ifc.name] || []).find((a) => a.mac && a.mac !== "00:00:00:00:00:00");
    arp.push({ ip: ifc.ip, mac: (selfMac?.mac || "00:00:00:00:00:00").toLowerCase() });
  }
  const devices = [];
  for (const r of arp) {
    const name = (await rdns(r.ip)) || "";
    devices.push({ ...r, name, isGateway: r.ip === gw });
  }
  return { gateway: gw, devices };
}

// ---- snapshot para el panel ----
async function buildSnapshot() {
  const { gateway, devices } = await discover();
  const now = new Date().toISOString();
  const out = [];
  const requests = [];
  for (const d of devices) {
    const mac = d.mac;
    if (!state.known[mac]) state.known[mac] = now; // primera vez que se ve
    const isApproved = state.approved[mac] || d.isGateway || d.ip === activeIface()?.ip;
    const isBlocked = !!state.blocked[mac];
    if (!isApproved && !isBlocked) {
      // dispositivo nuevo sin aprobar -> CUARENTENA (solicitud de acceso)
      requests.push({ mac, ip: d.ip, name: d.name || "Dispositivo nuevo", since: state.known[mac] });
      continue;
    }
    out.push({
      id: mac,
      name: d.name || (d.isGateway ? "Router / Módem" : `Dispositivo ${d.ip}`),
      owner: "—",
      type: guessType(d.name),
      mac,
      ip: d.ip,
      status: isBlocked ? "blocked" : "allowed",
      online: true,
      downMbps: 0, upMbps: 0, usageTodayGb: 0, connectedMinutes: 0,
      topApp: d.isGateway ? "puerta de enlace" : "—",
      firstSeen: state.known[mac] || "",
    });
  }
  saveState(state);
  return {
    routerName: ROUTER_NAME,
    wanIp: gateway || "—",
    ssid: activeIface()?.name || "LAN",
    online: true,
    speed: { downMbps: 0, upMbps: 0, pingMs: 0, jitterMs: 0, planDownMbps: 0, at: "" },
    devices: out,
    rules: [],
    schedules: [],
    usageByHour: [],
    usageByCategory: [],
    accessRequests: requests,
    totals: {
      devicesOnline: out.length,
      usageTodayGb: 0,
      blockedCount: out.filter((x) => x.status === "blocked").length,
      newDevices: requests.length,
    },
  };
}
function guessType(name) {
  const n = (name || "").toLowerCase();
  if (/iphone|android|phone|pixel|galaxy/.test(n)) return "phone";
  if (/ipad|tablet/.test(n)) return "tablet";
  if (/tv|roku|chromecast|firestick/.test(n)) return "tv";
  if (/playstation|ps4|ps5|xbox|nintendo|switch/.test(n)) return "console";
  if (/macbook|laptop/.test(n)) return "laptop";
  if (/imac|pc|desktop/.test(n)) return "desktop";
  return "phone";
}

// ---- ENFORCEMENT (cortar de verdad) ----
// Universal sin API del router = ARP-control (necesita permisos de admin).
// Aquí se deja el punto de integración; con root se activa el bloqueo real.
let enforcer = null;
async function applyEnforcement() {
  const blocked = Object.keys(state.blocked);
  if (blocked.length === 0) return;
  if (process.getuid && process.getuid() !== 0) {
    console.warn(`[enforce] ${blocked.length} equipo(s) marcados para cortar, pero el agente NO corre como root: el corte real (ARP) está inactivo. Ejecuta con 'sudo' para activarlo.`);
    return;
  }
  // TODO enforcer real (ARP spoof por MAC objetivo) cuando corre como root.
  // Integración: bettercap/arpspoof, o convertir el agente en gateway/DHCP.
}

// ---- API HTTP ----
function send(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(body));
}
function auth(req) {
  if (!TOKEN) return true;
  return req.headers["authorization"] === `Bearer ${TOKEN}`;
}
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch { return {}; }
}

// ---- cache de escaneo: refresca en segundo plano, sirve al instante ----
let cachedSnapshot = null;
let scanning = false;
async function refreshSnapshot() {
  if (scanning) return;
  scanning = true;
  try { cachedSnapshot = await buildSnapshot(); } catch (e) { console.warn("[scan]", e?.message || e); }
  scanning = false;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (!auth(req)) return send(res, 401, { error: "token inválido" });
  try {
    if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true });
    if (req.method === "GET" && req.url === "/snapshot") {
      if (!cachedSnapshot) await refreshSnapshot(); // primera vez: espera
      else refreshSnapshot(); // siguientes: sirve cache y refresca en 2º plano
      return send(res, 200, cachedSnapshot);
    }
    if (req.method === "POST" && req.url === "/device") {
      const { mac, status } = await readBody(req);
      if (!mac) return send(res, 400, { error: "mac requerido" });
      if (status === "allowed") { delete state.blocked[mac]; state.approved[mac] = true; }
      else state.blocked[mac] = true;
      saveState(state); await applyEnforcement();
      return send(res, 200, { ok: true });
    }
    if (req.method === "POST" && req.url === "/access") {
      const { mac, grant } = await readBody(req);
      if (!mac) return send(res, 400, { error: "mac requerido" });
      if (grant) { state.approved[mac] = true; delete state.blocked[mac]; }
      else { state.blocked[mac] = true; }
      saveState(state); await applyEnforcement();
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: "no encontrado" });
  } catch (e) {
    return send(res, 500, { error: String(e?.message || e) });
  }
});

server.listen(PORT, () => {
  const ifc = activeIface();
  console.log(`NetControl Agent en http://127.0.0.1:${PORT}`);
  console.log(`Interfaz: ${ifc?.name} ${ifc?.ip}  ·  token: ${TOKEN ? "sí" : "no"}`);
  console.log(`Endpoints: GET /snapshot · POST /device · POST /access`);
  refreshSnapshot(); // primer escaneo al arrancar
  setInterval(refreshSnapshot, 20000); // re-escanea cada 20s
});
