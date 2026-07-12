#!/usr/bin/env bash
# ============================================================================
# NetControl · arranca TODO con un solo comando (corte real incluido)
#   ./start.sh
# Levanta el panel en http://localhost:3300 y el agente CON permisos para
# cortar de verdad (te pedirá tu contraseña del Mac una sola vez).
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")"

PORT_PANEL=3300
AGENT_PORT=4000

echo "▶ NetControl — control de tu red"

# --- dependencias del panel ---
if [ ! -d node_modules ]; then
  echo "▶ instalando dependencias del panel…"
  npm install --no-audit --no-fund >/dev/null 2>&1
fi

# --- panel (si no está arriba) ---
if ! curl -fsS --max-time 2 "http://localhost:${PORT_PANEL}" >/dev/null 2>&1; then
  echo "▶ arrancando panel en http://localhost:${PORT_PANEL} …"
  NETCONTROL_BACKEND=agent AGENT_URL="http://127.0.0.1:${AGENT_PORT}" \
    nohup npm run dev -- -p "${PORT_PANEL}" >/tmp/nc-panel.log 2>&1 &
  # esperar a que responda
  for _ in $(seq 1 30); do
    curl -fsS --max-time 2 "http://localhost:${PORT_PANEL}" >/dev/null 2>&1 && break
    sleep 1
  done
fi
echo "  ✅ Panel: http://localhost:${PORT_PANEL}"

# --- agente con permisos (corte real por ARP) ---
echo "▶ parando cualquier agente previo…"
pkill -f netcontrol-agent 2>/dev/null || true
sleep 1
echo "▶ arrancando el AGENTE con permisos para el corte real."
echo "  (te pedirá tu contraseña del Mac — es para poder cortar el internet a un equipo)"
echo "  Deja esta ventana abierta. Ctrl+C para detener el agente."
echo ""
exec sudo AGENT_PORT="${AGENT_PORT}" node agent/netcontrol-agent.mjs
