# Sentinel - A Governance Platform For Agentic AI

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=Vite&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)
---

Placed 3rd for NTU's Deep Learning Week 2026 (OpenAI track)
Sentinel is an AI governance platform that acts as a centralised safety monitor and policy enforcement checkpoint for autonomous coding agents in development pipelines. Built to combat egregious code commits and pushes in production. We intercept high risk proposed actions and notify team leads before it causes catastrophic damage to your organisation and codebase.

---

## Key Features
1. **Automated Risk Scoring Engine**
2. **Human-in-the-Loop Review Queue**
3. **Comprehensive Audit Logging**

## Project Structure

```text
sentinel/
├── frontend/      # Sentinel governance UI
├── backend/       # Governance APIs and lifecycle logic
├── ml_service/    # Risk scoring service
├── docs/          # Runbooks, policy docs, checklists
└── docker-compose.yml
```
---

## Installation

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

---

## Known Limitations

- Some compatibility routes remain from migration packets.
- Audit persistence may be in-memory depending on branch state.
- Auth/RBAC and enterprise hardening are partial for hackathon scope.

---

## License
MIT