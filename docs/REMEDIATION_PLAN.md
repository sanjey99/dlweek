# Remediation Plan — FinSentinel DL Week

> Source of truth for the canonical data flow and contract between all layers.

## Canonical Flow

```
Frontend (React/Vite :5173)
  → POST /api/governance/actions/propose  { action, context, features? }
  → Backend (Express :4000)
       • if ml_assessment absent & features present → POST ML_URL/infer
       • normalizeMlAssessmentForGovernance → policyGate → save proposal
       ← { actionId, status, decision, ... }
  → POST /api/action/approve   { actionId, actor }
  → Backend resolves → WS broadcast { type:"action_resolved", ... }

ML Service (FastAPI :8000)
  POST /infer   { features: number[] }
  →  { risk_score, confidence, label, timestamp, ... }
  Strict contract: risk_score (finite), confidence (0-1), label (string), timestamp (ISO-8601)
```

## Pre-Remediation Gap Assessment

| # | Check | Status | Detail |
|---|-------|--------|--------|
| 1 | ML `/infer` returns strict keys | **BROKEN** | Returns `risk_category`/`uncertainty`, missing `label`/`confidence`/`timestamp` |
| 2 | Backend `/api/infer` no longer 502s | **BROKEN** | Depends on #1 — contract validation fails |
| 3 | `GET /api/governance/actions` list | **MISSING** | No route; `actionLifecycleStore` has no `listAll()` |
| 4 | Propose auto-calls ML | **PARTIAL** | Uses fallback when ml_assessment missing; doesn't call ML /infer |
| 5 | Approve/block WS broadcast | **MISSING** | WS only sends market ticks |
| 6 | Frontend loads from backend | **MISSING** | Uses hardcoded `mockActions` only |
| 7 | Frontend buttons call backend | **MISSING** | Local state mutations only |
| 8 | WebSocket updates UI | **MISSING** | No WS client |
| 9 | Docker deterministic installs | **PARTIAL** | `npm install` not `npm ci`; no lockfile guarantee |
| 10 | Nginx proxies `/api` + `/ws` | **MISSING** | Default nginx config, no reverse proxy |

## Phase 1 — ML ↔ Backend Contract (files: `ml_service/app.py`, `ml_service/requirements.txt`)

- Add `label`, `confidence`, `timestamp` to `/infer` response
- Map: `risk_category → label`, `uncertainty → confidence` (inverted: `1 - uncertainty`), add `_now() → timestamp`
- Fix `requirements.txt`: `torch==2.4.1+cpu` with `--extra-index-url`

## Phase 2 — Backend Endpoint Gaps (file: `backend/src/index.js`, `backend/src/engine/actionLifecycle.js`, `backend/src/engine/policyEnforcementService.js`)

- Add `listAll()` to actionLifecycleStore
- Add `list()` to policyEnforcementService
- Wire `GET /api/governance/actions` route
- Make propose auto-call ML `/infer` when features present and ml_assessment absent
- Add `POST /api/classify` proxy to ML `/classify`
- Broadcast WS on approve/block/escalate resolution
- Remove phantom `/api/simulate` route

## Phase 3 — Frontend API Wiring (files: `frontend/src/app/api/client.ts`, `frontend/src/app/App.tsx`)

- Create API client module with typed fetch helpers
- Replace `mockActions` with `GET /api/governance/actions` on mount
- Wire approve/block/escalate buttons to backend POST
- Add WebSocket client for live `action_resolved` events

## Phase 4 — Docker Reliability (files: Dockerfiles, `docker-compose.yml`, `frontend/nginx.conf`)

- Backend + Frontend Dockerfiles: `npm ci` instead of `npm install`
- ML Dockerfile: `--extra-index-url` for CPU torch
- Create `frontend/nginx.conf` with `/api` and `/ws` reverse proxy to backend
- Wire nginx.conf into frontend Dockerfile

## Ordered Checklist (verify after each phase)

- [x] ML `/infer` returns `{ risk_score, confidence, label, timestamp }`
- [x] Backend `/api/infer` returns 200 with valid contract
- [x] `GET /api/governance/actions` returns action list
- [x] Propose auto-calls ML when features present
- [x] Approve/block broadcasts WS event
- [x] Frontend loads actions from backend on mount
- [x] Frontend buttons call backend endpoints
- [x] WebSocket updates action feed live
- [x] `docker compose build` uses deterministic installs
- [x] Nginx proxies `/api/*` and `/ws/*` to backend
