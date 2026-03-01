# FinSentinel

FinSentinel is a hackathon finance AI platform with a microservice architecture:
- **Frontend**: React + Vite dashboard
- **Backend**: Node.js + Express API gateway
- **ML Service**: FastAPI (Python) for inference/simulation
- **Database**: Postgres (optional persistence)

It is designed for fast demos and iterative development of portfolio analytics, stock insights, and fraud workflows.

---

## Features

- Portfolio analysis and optimization flow
- Stock picker workflow with scoring output
- Fraud scan workflow with action-oriented decisions
- System health endpoints for backend and ML services
- Docker-first local development

---

## Project Structure

```text
hackathon_fin_ai/
├── frontend/      # Vite React app
├── backend/       # Express API service
├── ml_service/    # FastAPI ML service
├── data/          # Sample/synthetic datasets
├── docs/          # Runbooks and implementation notes
└── docker-compose.yml
```

---

## Prerequisites

- Docker Desktop (recommended)
- OR local runtimes:
  - Node.js 20+
  - Python 3.11+

---

## Quick Start (Docker)

From the repository root:

```bash
docker compose down
docker compose up --build -d
docker compose ps
```

### Service URLs

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:4000/health`
- ML health: `http://localhost:8000/health`
- Postgres: `localhost:5432`

### Useful logs

```bash
docker compose logs -f frontend
docker compose logs -f backend
docker compose logs -f ml-service
```

Stop services:

```bash
docker compose down
```

---

## Local Development (Without Docker)

### 1) ML Service

```bash
cd ml_service
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

### 2) Backend

```bash
cd backend
npm install
ML_URL=http://localhost:8000 npm run dev
# Windows CMD: set ML_URL=http://localhost:8000 && npm run dev
```

### 3) Frontend

```bash
cd frontend
npm install
VITE_API_URL=http://localhost:4000 npm run dev
# Windows CMD: set VITE_API_URL=http://localhost:4000 && npm run dev
```

---

## Environment Variables

### Backend

- `ML_URL` (default: `http://localhost:8000`)

### Frontend

- `VITE_API_URL` (default expected backend origin)

---

## API (Core)

### Backend
- `GET /health`
- `GET /api/system/status`
- `POST /api/infer`
- `POST /api/portfolio/optimize`
- `GET /api/stocks/picker`
- `POST /api/fraud/scan`

### ML Service
- `GET /health`
- `GET /model/info`
- `POST /infer`
- `GET /simulate`

> See `docs/RUNBOOK.md` for endpoint examples and smoke-test commands.

---

## Deployment

Typical setup:
- Deploy `frontend/` to Vercel
- Deploy `backend/` and `ml_service/` to Render (or equivalent)
- Set frontend env:
  - `VITE_API_URL=https://<your-backend-url>`
- Set backend env:
  - `ML_URL=https://<your-ml-url>`

---

## Known Limitations

- Some modules may still rely on demo-friendly assumptions depending on branch state
- Live market data quality depends on configured adapter/source availability
- Production hardening (auth, rate limiting, full audit persistence) may be incomplete

---

## Contributing

1. Create a feature branch from `main`
2. Make focused changes with clear commits
3. Run local smoke checks
4. Open a PR with test notes

---

## License

Add your project license here (e.g., MIT).
