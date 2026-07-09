"use client";

import { useMemo, useState } from "react";
import type { Device, DeviceStatus, NetworkSnapshot } from "@/lib/types";
import { DeviceIcon, Icon } from "./icons";

const DAYS = ["D", "L", "M", "M", "J", "V", "S"];

/** Envía una orden al backend (demo = no-op; adaptador real = ejecuta en tu red). */
function post(url: string, body: unknown) {
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
}

function StatCard({ icon, label, value, unit, tone = "accent" }: { icon: string; label: string; value: string; unit?: string; tone?: string }) {
  const toneMap: Record<string, string> = {
    accent: "text-accent bg-accent-soft", ok: "text-ok bg-ok/10", warn: "text-warn bg-warn/10", danger: "text-danger bg-danger/10",
  };
  return (
    <div className="card card-hover p-4">
      <div className="flex items-center gap-2">
        <span className={`grid h-7 w-7 place-items-center rounded-lg ${toneMap[tone]}`}>
          <Icon name={icon} className="h-4 w-4" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      </div>
      <div className="mt-2.5 flex items-baseline gap-1">
        <span className="text-2xl font-bold text-ink tabular-nums">{value}</span>
        {unit && <span className="text-sm text-muted">{unit}</span>}
      </div>
    </div>
  );
}

function statusPill(status: DeviceStatus) {
  if (status === "allowed") return <span className="pill text-ok"><span className="h-1.5 w-1.5 rounded-full bg-ok" />Activo</span>;
  if (status === "paused") return <span className="pill text-warn"><Icon name="pause" className="h-3 w-3" />En pausa</span>;
  return <span className="pill text-danger"><Icon name="block" className="h-3 w-3" />Bloqueado</span>;
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

  // Admisión a la red (portal cautivo / NAC): el admin da o niega acceso.
  function setAccess(mac: string, grant: boolean) {
    setSnap((s) => ({ ...s, accessRequests: s.accessRequests.filter((a) => a.mac !== mac) }));
    post("/api/access", { mac, grant });
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

  const speedPct = Math.min(100, Math.round((snap.speed.downMbps / Math.max(1, snap.speed.planDownMbps)) * 100));

  return (
    <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6">
      {/* Header */}
      <header className="rise rise-1 card mb-5 flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-center gap-3.5">
          <div className="grid h-12 w-12 place-items-center rounded-2xl text-accent shadow-nav" style={{ backgroundImage: "var(--grad-accent)" }}>
            <Icon name="wifi" className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="flex items-center text-xl font-bold tracking-tight">
              <span className="wordmark">NetControl</span>
              <span className="caret" />
            </h1>
            <p className="mt-0.5 text-xs text-muted">
              {snap.routerName} · SSID <span className="font-mono text-ink/70">{snap.ssid}</span> · WAN <span className="font-mono text-ink/70">{snap.wanIp}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="pill text-ok"><span className="live-dot h-2 w-2 rounded-full bg-ok" />En línea</span>
          <button onClick={runSpeedTest} disabled={testing} className="btn btn-primary">
            <Icon name="bolt" className="h-4 w-4" />
            {testing ? "Midiendo…" : "Probar velocidad"}
          </button>
        </div>
      </header>

      {/* Stats */}
      <section className="rise rise-2 mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard icon="down" label="Descarga" value={snap.speed.downMbps.toFixed(0)} unit="Mbps" tone="accent" />
        <StatCard icon="up" label="Subida" value={snap.speed.upMbps.toFixed(0)} unit="Mbps" tone="accent" />
        <StatCard icon="ping" label="Ping" value={String(snap.speed.pingMs)} unit="ms" tone="ok" />
        <StatCard icon="devices" label="Dispositivos" value={String(snap.totals.devicesOnline)} unit="online" tone="warn" />
        <StatCard icon="data" label="Datos hoy" value={snap.totals.usageTodayGb.toFixed(1)} unit="GB" tone="danger" />
      </section>

      {/* Solicitudes de acceso a la red (portal cautivo / NAC) */}
      {snap.accessRequests.length > 0 && (
        <section className="rise rise-2 card mb-5 p-4" style={{ borderColor: "color-mix(in oklab, var(--accent) 35%, var(--border))", background: "var(--accent-soft)" }}>
          <div className="flex items-center gap-2 text-accent-ink">
            <Icon name="shield" className="h-5 w-5" />
            <h2 className="text-sm font-bold">Solicitudes de acceso a la red · el administrador decide quién entra</h2>
          </div>
          <div className="mt-3 space-y-2">
            {snap.accessRequests.map((a) => (
              <div key={a.mac} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent-soft text-accent"><DeviceIcon type="phone" className="h-5 w-5" /></span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{a.name}</p>
                    <p className="font-mono text-xs text-muted">{a.mac}{a.ip ? ` · ${a.ip}` : ""}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setAccess(a.mac, true)} className="btn btn-ok"><Icon name="check" className="h-4 w-4" />Dar acceso</button>
                  <button onClick={() => setAccess(a.mac, false)} className="btn btn-danger"><Icon name="block" className="h-4 w-4" />Denegar</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Nuevos dispositivos */}
      {newDevices.length > 0 && (
        <section className="rise rise-2 card mb-5 p-4" style={{ borderColor: "color-mix(in oklab, var(--warn) 40%, var(--border))", background: "color-mix(in oklab, var(--warn) 8%, #fff)" }}>
          <div className="flex items-center gap-2 text-warn">
            <Icon name="alert" className="h-5 w-5" />
            <h2 className="text-sm font-bold">Dispositivo nuevo intentando conectarse</h2>
          </div>
          <div className="mt-3 space-y-2">
            {newDevices.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-warn/10 text-warn"><DeviceIcon type={d.type} className="h-5 w-5" /></span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{d.name}</p>
                    <p className="font-mono text-xs text-muted">{d.mac} · {d.ip}</p>
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

      <div className="rise rise-3 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Dispositivos */}
        <section className="card card-hover overflow-hidden p-0 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-line p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink"><Icon name="devices" className="h-4 w-4 text-accent" />Dispositivos en la red</h2>
            <span className="text-xs text-muted">{snap.devices.length} equipos · {snap.totals.blockedCount} bloqueados</span>
          </div>
          <div className="divide-y divide-line">
            {snap.devices.map((d) => (
              <DeviceRow key={d.id} d={d} onStatus={setStatus} />
            ))}
          </div>
        </section>

        {/* Velocidad + ancho de banda */}
        <section className="space-y-5">
          <div className="card card-hover p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink"><Icon name="bolt" className="h-4 w-4 text-accent" />Velocidad del plan</h2>
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-line">
              <div className="fill-anim h-full rounded-full transition-all duration-700" style={{ width: `${speedPct}%`, backgroundImage: "var(--grad-accent)" }} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-muted">
              <span>{snap.speed.downMbps.toFixed(0)} Mbps usados</span>
              <span>Plan {snap.speed.planDownMbps} Mbps</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl border border-line bg-bg p-3"><p className="text-lg font-bold text-ink tabular-nums">{snap.speed.pingMs} <span className="text-xs font-normal text-muted">ms</span></p><p className="text-xs text-muted">Latencia</p></div>
              <div className="rounded-xl border border-line bg-bg p-3"><p className="text-lg font-bold text-ink tabular-nums">{snap.speed.jitterMs} <span className="text-xs font-normal text-muted">ms</span></p><p className="text-xs text-muted">Jitter</p></div>
            </div>
          </div>

          {snap.usageByCategory.length > 0 && (
          <div className="card card-hover p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink"><Icon name="data" className="h-4 w-4 text-accent" />Uso por categoría</h2>
            <div className="mb-3 flex h-3 w-full overflow-hidden rounded-full border border-line">
              {snap.usageByCategory.map((c) => (
                <div key={c.label} style={{ width: `${(c.gb / totalCat) * 100}%`, background: c.color }} title={`${c.label}: ${c.gb} GB`} />
              ))}
            </div>
            <ul className="space-y-1.5">
              {snap.usageByCategory.map((c) => (
                <li key={c.label} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 text-ink/80"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.color }} />{c.label}</span>
                  <span className="font-mono text-muted tabular-nums">{c.gb} GB</span>
                </li>
              ))}
            </ul>
          </div>
          )}
        </section>
      </div>

      {/* Ancho de banda por hora */}
      {snap.usageByHour.length > 0 && (
      <section className="rise rise-4 card mt-5 p-4">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-ink"><Icon name="data" className="h-4 w-4 text-accent" />Consumo de hoy por hora</h2>
        <div className="flex h-40 items-end gap-1.5 sm:gap-2">
          {snap.usageByHour.map((u, i) => (
            <div key={u.hour} className="group flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] font-medium text-muted opacity-0 transition group-hover:opacity-100">{u.gb}GB</span>
              <div className="bar-grow w-full rounded-t transition-all duration-300 group-hover:brightness-110" style={{ height: `${(u.gb / maxHour) * 100}%`, backgroundImage: "linear-gradient(to top, #cdd9ff, #79a4ff)", animationDelay: `${i * 0.035}s` }} />
              <span className="text-[10px] text-muted tabular-nums">{u.hour}</span>
            </div>
          ))}
        </div>
      </section>
      )}

      <div className="rise rise-5 mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Reglas de bloqueo */}
        <section className="card card-hover overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-line p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink"><Icon name="shield" className="h-4 w-4 text-danger" />Bloqueo de webs y apps</h2>
            <button className="btn btn-ghost text-xs"><Icon name="plus" className="h-3.5 w-3.5" />Regla</button>
          </div>
          <ul className="divide-y divide-line">
            {snap.rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <span className={`grid h-8 w-8 place-items-center rounded-lg ${r.enabled ? "bg-danger/10 text-danger" : "bg-bg text-muted"}`}><Icon name={r.kind === "site" ? "globe" : "block"} className="h-4 w-4" /></span>
                  <div>
                    <p className="font-mono text-sm text-ink">{r.target}</p>
                    <p className="text-xs text-muted">{r.scopeLabel} · {r.kind === "site" ? "sitio" : r.kind === "app" ? "app" : "categoría"}</p>
                  </div>
                </div>
                <Toggle on={r.enabled} onClick={() => toggleRule(r.id)} />
              </li>
            ))}
          </ul>
        </section>

        {/* Horarios */}
        <section className="card card-hover overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-line p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink"><Icon name="clock" className="h-4 w-4 text-warn" />Horarios y límites</h2>
            <button className="btn btn-ghost text-xs"><Icon name="plus" className="h-3.5 w-3.5" />Horario</button>
          </div>
          <ul className="divide-y divide-line">
            {snap.schedules.map((sc) => (
              <li key={sc.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-semibold text-ink">{sc.label}</p>
                  <p className="text-xs text-muted">{sc.scopeLabel} · {sc.from}–{sc.to} · {sc.action === "cutoff" ? "corte" : "límite de velocidad"}</p>
                  <div className="mt-1.5 flex gap-1">
                    {DAYS.map((d, i) => (
                      <span key={i} className={`grid h-4 w-4 place-items-center rounded text-[9px] font-semibold ${sc.days.includes(i) ? "bg-warn/15 text-warn" : "bg-bg text-muted/60"}`}>{d}</span>
                    ))}
                  </div>
                </div>
                <Toggle on={sc.enabled} onClick={() => toggleSchedule(sc.id)} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <footer className="mt-9 pb-4 text-center text-xs text-muted">
        <span className="font-mono">NetControl</span> · panel demo con datos simulados · listo para conectar a un agente local (Agente · AdGuard · OpenWRT · UniFi · MikroTik · Firewalla)
      </footer>
    </div>
  );
}

function DeviceRow({ d, onStatus }: { d: Device; onStatus: (id: string, s: DeviceStatus) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-accent-soft/50">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${d.online ? "bg-accent-soft text-accent" : "bg-bg text-muted"}`}>
          <DeviceIcon type={d.type} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{d.name}</p>
          <p className="truncate font-mono text-xs text-muted">{d.ip} · {d.owner} · {d.topApp}</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-ink tabular-nums">{d.online ? `${d.downMbps.toFixed(1)} Mbps` : "—"}</p>
          <p className="text-xs text-muted tabular-nums">{d.usageTodayGb} GB hoy</p>
        </div>
        {statusPill(d.status)}
        <div className="flex gap-1.5">
          {d.status !== "allowed" && <button title="Permitir" onClick={() => onStatus(d.id, "allowed")} className="btn btn-ok px-2"><Icon name="check" className="h-4 w-4" /></button>}
          {d.status === "allowed" && <button title="Pausar" onClick={() => onStatus(d.id, "paused")} className="btn btn-ghost px-2 text-warn"><Icon name="pause" className="h-4 w-4" /></button>}
          {d.status !== "blocked" && <button title="Cortar acceso" onClick={() => onStatus(d.id, "blocked")} className="btn btn-danger px-2"><Icon name="block" className="h-4 w-4" /></button>}
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return <button onClick={onClick} className="switch" data-on={on} aria-pressed={on} />;
}
