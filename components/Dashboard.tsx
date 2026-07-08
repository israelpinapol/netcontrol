"use client";

import { useMemo, useState } from "react";
import type { Device, DeviceStatus, NetworkSnapshot } from "@/lib/types";
import { DeviceIcon, Icon } from "./icons";

const DAYS = ["D", "L", "M", "M", "J", "V", "S"];

/** Envía una orden al backend (demo = no-op; adaptador real = ejecuta en tu red). */
function post(url: string, body: unknown) {
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
}

function StatCard({ icon, label, value, unit, tone = "brand" }: { icon: string; label: string; value: string; unit?: string; tone?: string }) {
  const toneMap: Record<string, string> = {
    brand: "text-brand", accent: "text-accent", ok: "text-ok", warn: "text-warn", danger: "text-danger",
  };
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-slate-400">
        <Icon name={icon} className={`h-4 w-4 ${toneMap[tone]}`} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-2xl font-semibold text-white">{value}</span>
        {unit && <span className="text-sm text-slate-400">{unit}</span>}
      </div>
    </div>
  );
}

function statusPill(status: DeviceStatus) {
  if (status === "allowed") return <span className="pill bg-ok/15 text-ok"><span className="h-1.5 w-1.5 rounded-full bg-ok" />Activo</span>;
  if (status === "paused") return <span className="pill bg-warn/15 text-warn"><Icon name="pause" className="h-3 w-3" />En pausa</span>;
  return <span className="pill bg-danger/15 text-danger"><Icon name="block" className="h-3 w-3" />Bloqueado</span>;
}

export default function Dashboard({ initial }: { initial: NetworkSnapshot }) {
  const [snap, setSnap] = useState<NetworkSnapshot>(initial);
  const [testing, setTesting] = useState(false);

  const maxHour = useMemo(() => Math.max(1, ...snap.usageByHour.map((u) => u.gb)), [snap.usageByHour]);
  const totalCat = useMemo(() => snap.usageByCategory.reduce((a, c) => a + c.gb, 0) || 1, [snap.usageByCategory]);
  const newDevices = snap.devices.filter((d) => d.isNew);

  function setStatus(id: string, status: DeviceStatus) {
    setSnap((s) => {
      const devices = s.devices.map((d) =>
        d.id === id ? { ...d, status, online: status === "blocked" ? false : d.online, downMbps: status === "allowed" ? d.downMbps : 0, upMbps: status === "allowed" ? d.upMbps : 0 } : d,
      );
      return {
        ...s,
        devices,
        totals: { ...s.totals, devicesOnline: devices.filter((d) => d.online).length, blockedCount: devices.filter((d) => d.status === "blocked").length },
      };
    });
    post("/api/device", { id, status });
  }

  function approveNew(id: string) {
    setSnap((s) => ({ ...s, devices: s.devices.map((d) => (d.id === id ? { ...d, isNew: false, name: "Dispositivo aprobado" } : d)), totals: { ...s.totals, newDevices: s.totals.newDevices - 1 } }));
  }

  function toggleRule(id: string) {
    const enabled = !snap.rules.find((r) => r.id === id)?.enabled;
    setSnap((s) => ({ ...s, rules: s.rules.map((r) => (r.id === id ? { ...r, enabled } : r)) }));
    post("/api/rule", { id, enabled });
  }
  function toggleSchedule(id: string) {
    const enabled = !snap.schedules.find((sc) => sc.id === id)?.enabled;
    setSnap((s) => ({ ...s, schedules: s.schedules.map((sc) => (sc.id === id ? { ...sc, enabled } : sc)) }));
    post("/api/schedule", { id, enabled });
  }

  async function runSpeedTest() {
    setTesting(true);
    try {
      const res = await fetch("/api/speedtest", { method: "POST" });
      const r = (await res.json()) as { downMbps: number; upMbps: number; pingMs: number };
      if (r && r.downMbps > 0) {
        setSnap((s) => ({ ...s, speed: { ...s.speed, downMbps: r.downMbps, upMbps: r.upMbps, pingMs: r.pingMs } }));
      }
    } catch {
      /* backend sin test de velocidad (p. ej. AdGuard) */
    }
    setTesting(false);
  }

  const speedPct = Math.min(100, Math.round((snap.speed.downMbps / snap.speed.planDownMbps) * 100));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* Header */}
      <header className="card mb-5 flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand/15 text-brand">
            <Icon name="wifi" className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">NetControl</h1>
            <p className="text-xs text-slate-400">
              {snap.routerName} · SSID <span className="font-mono text-slate-300">{snap.ssid}</span> · WAN <span className="font-mono text-slate-300">{snap.wanIp}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="pill bg-ok/10 text-ok">
            <span className="live-dot h-2 w-2 rounded-full bg-ok" /> En línea
          </span>
          <button onClick={runSpeedTest} disabled={testing} className="btn btn-ghost">
            <Icon name="bolt" className="h-4 w-4 text-brand" />
            {testing ? "Midiendo…" : "Probar velocidad"}
          </button>
        </div>
      </header>

      {/* Stats */}
      <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard icon="down" label="Descarga" value={snap.speed.downMbps.toFixed(0)} unit="Mbps" tone="brand" />
        <StatCard icon="up" label="Subida" value={snap.speed.upMbps.toFixed(0)} unit="Mbps" tone="accent" />
        <StatCard icon="ping" label="Ping" value={String(snap.speed.pingMs)} unit="ms" tone="ok" />
        <StatCard icon="devices" label="Dispositivos" value={String(snap.totals.devicesOnline)} unit="online" tone="warn" />
        <StatCard icon="data" label="Datos hoy" value={snap.totals.usageTodayGb.toFixed(1)} unit="GB" tone="danger" />
      </section>

      {/* Nuevos dispositivos */}
      {newDevices.length > 0 && (
        <section className="card mb-5 border-warn/30 bg-warn/5 p-4">
          <div className="flex items-center gap-2 text-warn">
            <Icon name="alert" className="h-5 w-5" />
            <h2 className="text-sm font-semibold">Dispositivo nuevo intentando conectarse</h2>
          </div>
          <div className="mt-3 space-y-2">
            {newDevices.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-base-700/60 p-3">
                <div className="flex items-center gap-3">
                  <DeviceIcon type={d.type} className="h-5 w-5 text-slate-300" />
                  <div>
                    <p className="text-sm font-medium text-white">{d.name}</p>
                    <p className="font-mono text-xs text-slate-400">{d.mac} · {d.ip}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => approveNew(d.id)} className="btn btn-ok"><Icon name="check" className="h-4 w-4" />Permitir</button>
                  <button onClick={() => setStatus(d.id, "blocked")} className="btn btn-danger"><Icon name="block" className="h-4 w-4" />Bloquear</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Dispositivos */}
        <section className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-white/5 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Icon name="devices" className="h-4 w-4 text-brand" />Dispositivos en la red</h2>
            <span className="text-xs text-slate-400">{snap.devices.length} equipos · {snap.totals.blockedCount} bloqueados</span>
          </div>
          <div className="divide-y divide-white/5">
            {snap.devices.map((d) => (
              <DeviceRow key={d.id} d={d} onStatus={setStatus} />
            ))}
          </div>
        </section>

        {/* Velocidad + ancho de banda */}
        <section className="space-y-5">
          <div className="card p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><Icon name="bolt" className="h-4 w-4 text-brand" />Velocidad del plan</h2>
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-base-700">
              <div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-soft transition-all duration-700" style={{ width: `${speedPct}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-slate-400">
              <span>{snap.speed.downMbps.toFixed(0)} Mbps usados</span>
              <span>Plan {snap.speed.planDownMbps} Mbps</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-base-700/60 p-3"><p className="text-lg font-semibold text-white">{snap.speed.pingMs} <span className="text-xs font-normal text-slate-400">ms</span></p><p className="text-xs text-slate-400">Latencia</p></div>
              <div className="rounded-xl bg-base-700/60 p-3"><p className="text-lg font-semibold text-white">{snap.speed.jitterMs} <span className="text-xs font-normal text-slate-400">ms</span></p><p className="text-xs text-slate-400">Jitter</p></div>
            </div>
          </div>

          {snap.usageByCategory.length > 0 && (
          <div className="card p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><Icon name="data" className="h-4 w-4 text-accent" />Uso por categoría</h2>
            <div className="mb-3 flex h-3 w-full overflow-hidden rounded-full">
              {snap.usageByCategory.map((c) => (
                <div key={c.label} style={{ width: `${(c.gb / totalCat) * 100}%`, background: c.color }} title={`${c.label}: ${c.gb} GB`} />
              ))}
            </div>
            <ul className="space-y-1.5">
              {snap.usageByCategory.map((c) => (
                <li key={c.label} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 text-slate-300"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.color }} />{c.label}</span>
                  <span className="font-mono text-slate-400">{c.gb} GB</span>
                </li>
              ))}
            </ul>
          </div>
          )}
        </section>
      </div>

      {/* Ancho de banda por hora */}
      {snap.usageByHour.length > 0 && (
      <section className="card mt-5 p-4">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-white"><Icon name="data" className="h-4 w-4 text-brand" />Consumo de hoy por hora</h2>
        <div className="flex h-40 items-end gap-1.5 sm:gap-2">
          {snap.usageByHour.map((u) => (
            <div key={u.hour} className="group flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] text-slate-500 opacity-0 transition group-hover:opacity-100">{u.gb}GB</span>
              <div className="w-full rounded-t bg-gradient-to-t from-accent/40 to-brand transition-all duration-500 hover:from-accent hover:to-brand-soft" style={{ height: `${(u.gb / maxHour) * 100}%` }} />
              <span className="text-[10px] text-slate-500">{u.hour}</span>
            </div>
          ))}
        </div>
      </section>
      )}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Reglas de bloqueo */}
        <section className="card">
          <div className="flex items-center justify-between border-b border-white/5 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Icon name="shield" className="h-4 w-4 text-danger" />Bloqueo de webs y apps</h2>
            <button className="btn btn-ghost text-xs"><Icon name="plus" className="h-3.5 w-3.5" />Regla</button>
          </div>
          <ul className="divide-y divide-white/5">
            {snap.rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <span className={`grid h-8 w-8 place-items-center rounded-lg ${r.enabled ? "bg-danger/15 text-danger" : "bg-white/5 text-slate-500"}`}><Icon name={r.kind === "site" ? "globe" : "block"} className="h-4 w-4" /></span>
                  <div>
                    <p className="font-mono text-sm text-white">{r.target}</p>
                    <p className="text-xs text-slate-400">{r.scopeLabel} · {r.kind === "site" ? "sitio" : r.kind === "app" ? "app" : "categoría"}</p>
                  </div>
                </div>
                <Toggle on={r.enabled} onClick={() => toggleRule(r.id)} />
              </li>
            ))}
          </ul>
        </section>

        {/* Horarios */}
        <section className="card">
          <div className="flex items-center justify-between border-b border-white/5 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Icon name="clock" className="h-4 w-4 text-warn" />Horarios y límites</h2>
            <button className="btn btn-ghost text-xs"><Icon name="plus" className="h-3.5 w-3.5" />Horario</button>
          </div>
          <ul className="divide-y divide-white/5">
            {snap.schedules.map((sc) => (
              <li key={sc.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium text-white">{sc.label}</p>
                  <p className="text-xs text-slate-400">{sc.scopeLabel} · {sc.from}–{sc.to} · {sc.action === "cutoff" ? "corte" : "límite de velocidad"}</p>
                  <div className="mt-1.5 flex gap-1">
                    {DAYS.map((d, i) => (
                      <span key={i} className={`grid h-4 w-4 place-items-center rounded text-[9px] ${sc.days.includes(i) ? "bg-warn/20 text-warn" : "bg-white/5 text-slate-600"}`}>{d}</span>
                    ))}
                  </div>
                </div>
                <Toggle on={sc.enabled} onClick={() => toggleSchedule(sc.id)} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <footer className="mt-8 pb-4 text-center text-xs text-slate-500">
        NetControl · panel demo con datos simulados · listo para conectar a un agente local (Pi-hole · OpenWRT · UniFi · MikroTik · Firewalla)
      </footer>
    </div>
  );
}

function DeviceRow({ d, onStatus }: { d: Device; onStatus: (id: string, s: DeviceStatus) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${d.online ? "bg-brand/10 text-brand" : "bg-white/5 text-slate-500"}`}>
          <DeviceIcon type={d.type} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{d.name}</p>
          <p className="truncate font-mono text-xs text-slate-400">{d.ip} · {d.owner} · {d.topApp}</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden text-right sm:block">
          <p className="text-sm text-white">{d.online ? `${d.downMbps.toFixed(1)} Mbps` : "—"}</p>
          <p className="text-xs text-slate-400">{d.usageTodayGb} GB hoy</p>
        </div>
        {statusPill(d.status)}
        <div className="flex gap-1.5">
          {d.status !== "allowed" && <button title="Permitir" onClick={() => onStatus(d.id, "allowed")} className="btn btn-ok px-2 py-1.5"><Icon name="check" className="h-4 w-4" /></button>}
          {d.status === "allowed" && <button title="Pausar" onClick={() => onStatus(d.id, "paused")} className="btn btn-ghost px-2 py-1.5 text-warn"><Icon name="pause" className="h-4 w-4" /></button>}
          {d.status !== "blocked" && <button title="Cortar acceso" onClick={() => onStatus(d.id, "blocked")} className="btn btn-danger px-2 py-1.5"><Icon name="block" className="h-4 w-4" /></button>}
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-brand" : "bg-base-600"}`} aria-pressed={on}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}
