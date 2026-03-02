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
- **Realtime**: WebSocket signal feed (`/ws/signals`) for integrity status

## Project Structure

```text
dlweek/
├── frontend/      # Sentinel governance UI
├── backend/       # Governance APIs and lifecycle logic
├── ml_service/    # Risk scoring service
├── docs/          # Runbooks, policy docs, checklists
└── docker-compose.yml
```

## Environment Setup (Required After Pull)

Create your local env file every time you clone/pull to a fresh machine:

```bash
cp .env.example .env
```

Then update values in `.env` as needed for your machine.

Minimum variables used by this repo:

```env
OPENAI_API_KEY=your_key_here
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
- Realtime WS: `ws://localhost:4000/ws/signals`

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

### Governance
- `POST /api/governance/policy-gate` — legacy policy gate
- `POST /api/governance/fusion` — fusion evaluator (primary)
- `POST /api/governance/actions/propose` — propose action for review
- `GET /api/governance/actions/:actionId` — action lifecycle detail
- `POST /api/action/approve` — human approve
- `POST /api/action/block` — human block
- `POST /api/action/escalate` *(compatibility route; not used in Sentinel MVP UI flow)*

### Fusion Observability & Audit (ARCH-CORE P3/P4)
- `GET /api/governance/fusion/health` — policy version, metrics snapshot
- `GET /api/governance/fusion/audit` — audit trail (newest-first, `?limit=N`)
- `GET /api/governance/fusion/audit/:request_id` — single audit record lookup

### Health / Risk / Integrity
- `GET /health`
- `GET /api/demo-cases`
- `GET /api/model-info`
- `POST /api/infer` — ML inference proxy
- `POST /api/ensemble` — ensemble risk scoring
- `POST /api/scenario/run` — stress-test scenario runner

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
#### Error during connect
When running [docker set up commands](#1-quick-start-docker), if terminal response shows the below, it means Docker is not responding. 
``` bash
error during connect: Get "http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.51/containers/json?all=1&filters=%7B%22label%22%3A%7B%22com.docker.compose.config-hash%22%3Atrue%2C%22com.docker.compose.oneoff%3DFalse%22%3Atrue%2C%22com.docker.compose.project%3Ddlweek%22%3Atrue%7D%7D": open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
```
To resolve:
1. Open Docker Desktop.
2. Wait for Docker to fully initialise.
3. Run the setup commands again.
If the issue persists after starting Docker Desktop, try restarting your machine and Docker.