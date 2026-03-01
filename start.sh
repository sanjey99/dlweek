#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
#  Sentinel Platform — Startup Script  (Linux / macOS)
# ──────────────────────────────────────────────────────────────
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
ML_DIR="$ROOT/ml_service"
BE_DIR="$ROOT/backend"
FE_DIR="$ROOT/frontend"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[  OK]${NC}  $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $1"; }

PIDS=()

cleanup() {
  echo ""
  info "Shutting down all services..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null && wait "$pid" 2>/dev/null
  done
  fuser -k 8000/tcp 4000/tcp 5173/tcp 2>/dev/null || true
  ok "All services stopped."
  exit 0
}
trap cleanup SIGINT SIGTERM

# ── 0. Pre-flight checks ────────────────────────────────────
check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    fail "$1 is required but not installed."
    exit 1
  fi
}

info "Running pre-flight checks..."
check_cmd node
check_cmd python3
check_cmd curl
ok "node $(node -v)  |  python3 $(python3 --version 2>&1 | awk '{print $2}')  |  curl installed"

# ── 1. Free ports ────────────────────────────────────────────
info "Freeing ports 8000, 4000, 5173..."
fuser -k 8000/tcp 4000/tcp 5173/tcp 2>/dev/null || true
sleep 1
ok "Ports cleared."

# ── 2. Install dependencies (if needed) ─────────────────────

# Python venv + deps (single venv in project root)
if [ ! -d "$ROOT/.venv" ]; then
  info "Creating Python virtual environment..."
  python3 -m venv "$ROOT/.venv"
fi
if [ -f "$ROOT/requirements.txt" ]; then
  info "Installing Python dependencies..."
  "$ROOT/.venv/bin/pip" install -q -r "$ROOT/requirements.txt"
  ok "Python dependencies installed."
fi

# Node backend deps
if [ ! -d "$BE_DIR/node_modules" ]; then
  info "Installing backend Node dependencies..."
  (cd "$BE_DIR" && npm install --silent)
  ok "Backend dependencies installed."
fi

# Node frontend deps
if [ ! -d "$FE_DIR/node_modules" ]; then
  info "Installing frontend Node dependencies..."
  (cd "$FE_DIR" && npm install --silent)
  ok "Frontend dependencies installed."
fi

# ── 3. Start ML Service (port 8000) ─────────────────────────
info "Starting ML Service on :8000 ..."
(cd "$ML_DIR" && "$ROOT/.venv/bin/python" -m uvicorn app:app --host 0.0.0.0 --port 8000) &
PIDS+=($!)

# ── 4. Start Backend (port 4000) ────────────────────────────
info "Starting Backend on :4000 ..."
(cd "$BE_DIR" && node src/index.js) &
PIDS+=($!)

# ── 5. Start Frontend (port 5173) ───────────────────────────
info "Starting Frontend on :5173 ..."
(cd "$FE_DIR" && ./node_modules/.bin/vite --port 5173 --host 0.0.0.0) &
PIDS+=($!)

# ── 6. Health checks ────────────────────────────────────────
info "Waiting for services to start..."
sleep 4

echo ""
info "Running health checks..."
echo ""

# ML Service
if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
  ML_HEALTH=$(curl -s http://localhost:8000/health)
  ok "ML Service   → $ML_HEALTH"
else
  fail "ML Service   → not responding on :8000"
fi

# Backend
if curl -sf http://localhost:4000/health > /dev/null 2>&1; then
  BE_HEALTH=$(curl -s http://localhost:4000/health)
  ok "Backend      → $BE_HEALTH"
else
  fail "Backend      → not responding on :4000"
fi

# Frontend
FE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 2>/dev/null || echo "000")
if [ "$FE_STATUS" = "200" ]; then
  ok "Frontend     → HTTP $FE_STATUS on :5173"
else
  fail "Frontend     → HTTP $FE_STATUS on :5173"
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Sentinel is running!${NC}"
echo -e "${GREEN}  Dashboard : http://localhost:5173${NC}"
echo -e "${GREEN}  Backend   : http://localhost:4000${NC}"
echo -e "${GREEN}  ML Service: http://localhost:8000${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
info "Press Ctrl+C to stop all services."
echo ""

# Keep script alive
wait
