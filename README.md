# Sentinel

Sentinel is a hackathon AI governance platform that acts as a centralized safety monitor and policy enforcement checkpoint for autonomous coding agents in development pipelines.

## Canonical Product Definition

### Primary Purpose
Sentinel serves as a centralized safety monitor and policy enforcement checkpoint for AI agents operating within development pipelines.

### Problem Addressed
Sentinel mitigates operational, compliance, and security risks caused by unbounded AI autonomy by intercepting high-risk proposed actions and requiring human oversight before execution.

### Key Features
1. **Automated Risk Scoring Engine**
2. **Human-in-the-Loop Review Queue**
3. **Comprehensive Audit Logging**

## Architecture

- **Frontend**: React + Vite Sentinel governance console
- **Backend**: Node.js + Express policy/fusion/lifecycle APIs
- **ML Service**: FastAPI risk inference service
- **Database**: PostgreSQL 16 (Docker) for persistence
- **Realtime**: WebSocket feed (`/ws`) for live action updates

## Project Structure

```text
dlweek/
├── frontend/           # Sentinel governance UI (React + Vite)
├── backend/            # Governance APIs and lifecycle logic (Express)
│   ├── src/
│   │   ├── adapters/   # External data adapters
│   │   ├── engine/     # Policy gate, ensemble, ML contract, lifecycle
│   │   └── fusion/     # Fusion evaluator, audit store, schema, metrics
│   ├── test/           # Integration tests
│   └── tests/          # Unit & e2e tests
├── ml_service/         # Risk scoring service (FastAPI + PyTorch)
├── data/               # Demo/test action datasets & generators
├── testbench/          # API, fusion, ML, performance & security test suites
├── screenshots/        # UI reference screenshots
├── .env.example        # Environment variable template
├── docker-compose.yml  # Full-stack Docker orchestration (incl. PostgreSQL)
├── requirements.txt    # Python dependencies (root-level venv)
├── start.sh            # One-command startup (Linux / macOS)
└── start.bat           # One-command startup (Windows)
```

## Environment Setup (Required After Pull)

Create your local env file every time you clone/pull to a fresh machine:

```bash
cp .env.example .env
```

Then update values in `.env` as needed for your machine.

Minimum variables used by this repo (see `.env.example` for defaults):

```env
OPENAI_API_KEY=replace_with_your_own_key
ML_URL=http://localhost:8000
PORT=4000
VITE_API_URL=http://localhost:4000
VITE_WS_URL=ws://localhost:4000
```

### Choose either 1. Quick Start (Docker) or 2. Local Development
## 1. Quick Start (Docker)
Ensure that Docker Desktop is already running before entering the following commands (avoids ["error during connect"](#error-during-connect) error).
```bash
docker compose down
docker compose up --build -d
docker compose ps
```

### Service URLs
- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:4000/health`
- ML health: `http://localhost:8000/health`
- Realtime WS: `ws://localhost:4000/ws`

## Local Development (macOS vs non-macOS)

### macOS (Apple Silicon / Intel)
- Use Python `3.10` or `3.11` for the ML service.
- CUDA packages are skipped automatically on macOS by environment markers in `requirements.txt`.

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
```

### Linux / non-macOS
- CPU-only: same commands as macOS.
- NVIDIA GPU/CUDA on Linux: install from the same `requirements.txt`; CUDA packages (`nvidia-*`, `triton`) are Linux-only and will install there.

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
```

### Run All Services (recommended)

From repo root:

```bash
bash start.sh
```

On Windows:

```bat
start.bat
```

### Run Services Manually

### 1) ML Service
```bash
cd ml_service
../.venv/bin/python -m uvicorn app:app --host 0.0.0.0 --port 8000
```

### 2) Backend
```bash
cd backend
npm install
npm run dev
```

### 3) Frontend
```bash
cd frontend
npm install
npm run dev
```

## Core API Surface

### Actions
- `POST /api/actions/submit` — submit a single action for risk classification
- `POST /api/actions/upload` — bulk-upload actions (processes with delay, broadcasts via WS)
- `GET /api/actions/upload/:sessionId` — poll upload session progress
- `GET /api/actions` — list all actions (`?status=pending` to filter)
- `POST /api/actions/:id/approve` — human approve
- `POST /api/actions/:id/block` — human block
- `POST /api/actions/:id/escalate` — escalate action *(not used in MVP UI flow)*

### Governance / Fusion
- `POST /api/governance/policy-gate` — legacy policy gate
- `POST /api/policy/gate` — alias for legacy policy gate
- `POST /api/governance/fusion` — fusion evaluator (primary)
- `POST /api/governance/policy-gate/v2` — legacy request evaluated via fusion
- `POST /api/policy/gate/v2` — alias for the above

### Fusion Observability & Audit
- `GET /api/governance/fusion/health` — policy version, metrics snapshot
- `GET /api/governance/fusion/audit` — audit trail (newest-first, `?limit=N`)
- `GET /api/governance/fusion/audit/:request_id` — single audit record lookup

### Agent
- `POST /api/agent/chat` — OpenAI assistant-backed agent chat

### Notifications
- `GET /api/notifications` — list notifications
- `POST /api/notifications/read` — mark notification as read
- `POST /api/notifications/read-all` — mark all notifications as read

### Health & ML Proxy
- `GET /health` — backend health check
- `GET /api/model-info` — ML model metadata (proxied from ML service)
- `POST /api/classify` — ML risk classification proxy
- `POST /api/accuracy` — compute model accuracy against labelled set

### ML Service (direct, port 8000)
- `GET /health` — ML service health
- `GET /model/info` — model metadata
- `POST /infer` — legacy inference endpoint
- `POST /classify` — risk classification
- `POST /accuracy` — accuracy evaluation

### WebSocket
- `ws://localhost:4000/ws` — live action & notification broadcast

## MVP Decision Scope

Sentinel MVP UI is binary by design:
- **Approve**
- **Reject/Block**

Escalation is intentionally excluded from MVP interaction controls.

## Deployment Notes

- Frontend: Vercel/Netlify/static host
- Backend + ML: Render/Fly/VM
- Frontend env: `VITE_API_URL=<backend-url>`
- Backend env: `ML_URL=<ml-url>`

## Known Limitations

- Some compatibility routes remain from migration packets.
- Audit persistence may be in-memory depending on branch state.
- Auth/RBAC and enterprise hardening are partial for hackathon scope.

## Common Errors

#### Error during connect (Docker)
When running [docker set up commands](#1-quick-start-docker), if the terminal shows:
```bash
error during connect: Get "http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/...": open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
```
Docker is not responding. To resolve:
1. Open Docker Desktop.
2. Wait for Docker to fully initialise.
3. Run the setup commands again.

If the issue persists, try restarting your machine and Docker.

---

#### Port already in use
```bash
Error: listen EADDRINUSE: address already in use :::4000
```
Another process is occupying the port. Free it before starting:
```bash
# Linux / macOS
fuser -k 8000/tcp 4000/tcp 5173/tcp
# Windows (PowerShell)
Stop-Process -Id (Get-NetTCPConnection -LocalPort 4000).OwningProcess -Force
```
The `start.sh` script does this automatically.

---

#### Python version not supported
```bash
[FAIL] No Python 3.10 – 3.12 found.
```
The ML service requires Python **3.10, 3.11, or 3.12**. Install a supported version:
```bash
# macOS
brew install python@3.12
# Ubuntu / Debian
sudo apt-get install python3.12 python3.12-venv
```
Then re-run `bash start.sh` — it will detect the new binary automatically.

---

#### ModuleNotFoundError when starting ML service
```bash
ModuleNotFoundError: No module named 'torch'
```
Python dependencies were not installed in the virtual environment:
```bash
source .venv/bin/activate
pip install -r requirements.txt
```
If the venv was created with a different Python version, delete and recreate it:
```bash
rm -rf .venv
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

---

#### OPENAI_API_KEY not set / invalid
```
Error: 401 Unauthorized — Incorrect API key provided
```
The agent chat feature requires a valid OpenAI API key.
1. Copy the template: `cp .env.example .env`
2. Replace `replace_with_your_own_key` with your actual key in `.env`.
3. Also copy to the backend: `cp .env backend/.env`
4. Restart the backend.

> **Note:** Most Sentinel features (risk scoring, action review, audit) work without an OpenAI key. Only the agent chat endpoint requires it.

---

#### ML Service not responding (backend logs `ECONNREFUSED`)
```
Error: connect ECONNREFUSED 127.0.0.1:8000
```
The backend proxies ML requests to `http://localhost:8000`. If the ML service hasn't started yet or crashed:
1. Check that `risk_model.pt` exists in `ml_service/`.
2. Start the ML service manually:
   ```bash
   cd ml_service
   ../.venv/bin/python -m uvicorn app:app --host 0.0.0.0 --port 8000
   ```
3. Verify: `curl http://localhost:8000/health`

---

#### `npm install` fails with permission errors
```bash
Error: EACCES: permission denied
```
Do **not** run `npm install` with `sudo`. Fix ownership instead:
```bash
sudo chown -R $(whoami) ~/.npm
npm install
```

---

#### Frontend shows "Network Error" or CORS errors
The frontend expects the backend at the URL set in `VITE_API_URL` (default: `http://localhost:4000`).
- Make sure the backend is running on port 4000.
- If you changed the backend port, update `VITE_API_URL` accordingly in your `.env` and restart the frontend.

---

#### Docker Compose: database connection refused
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
The PostgreSQL container may still be starting. Docker Compose uses health checks but in rare cases the backend starts before the DB is ready.
```bash
docker compose down
docker compose up --build -d
# Wait a few seconds, then verify:
docker compose ps
```