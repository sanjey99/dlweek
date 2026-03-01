# Runbook (MVP)

## Preferred: Docker microservices
```bash
# optional: train model first (outside docker)
cd ml_service && python3 train.py && cd ..
# optional: generate synthetic csv
python3 data/generate_synthetic.py

docker compose up --build
```

Then open:
- Frontend: http://localhost:5173
- Backend health: http://localhost:4000/health
- ML health: http://localhost:8000/health
- WebSocket stream: ws://localhost:4000/ws/signals

## Test endpoints quickly
```bash
curl -s http://localhost:4000/api/demo-cases
curl -s http://localhost:4000/api/model-info
curl -s http://localhost:4000/api/simulate
curl -s -X POST http://localhost:4000/api/infer \
  -H 'Content-Type: application/json' \
  -d '{"features":[0.1,0.4,0.2,0.3,0.8,0.2,0.5,0.9]}'
curl -s -X POST http://localhost:4000/api/governance/policy-gate \
  -H 'Content-Type: application/json' \
  -d '{
    "action":{"type":"deploy-prod"},
    "context":{
      "riskScore":0.81,
      "mlConfidence":0.87,
      "testsPassing":false,
      "touchesCriticalPaths":true,
      "targetEnvironment":"prod",
      "destructive":true,
      "rollbackPlanPresent":false
    }
  }'

# BE-P2 end-to-end action path (propose -> review -> approve)
ACTION_ID=$(curl -s -X POST http://localhost:4000/api/governance/actions/propose \
  -H 'Content-Type: application/json' \
  -d '{
    "action":{"type":"merge-main"},
    "context":{"riskScore":0.58,"mlConfidence":0.82,"testsPassing":true,"touchesCriticalPaths":true,"rollbackPlanPresent":true}
  }' | node -e "process.stdin.on('data', d => process.stdout.write(JSON.parse(d).actionId))")
echo "ACTION_ID=${ACTION_ID}"
curl -s -X POST http://localhost:4000/api/action/approve \
  -H 'Content-Type: application/json' \
  -d "{\"actionId\":\"${ACTION_ID}\",\"actor\":\"qa-lead\",\"notes\":\"Manual verification complete\"}"
curl -s http://localhost:4000/api/governance/actions/${ACTION_ID}

# BE-P3 strict ML contract + lifecycle transitions
ACTION_REVIEW=$(curl -s -X POST http://localhost:4000/api/governance/actions/propose \
  -H 'Content-Type: application/json' \
  -d '{
    "action":{"type":"merge-main"},
    "context":{"testsPassing":true,"touchesCriticalPaths":true,"rollbackPlanPresent":true},
    "ml_assessment":{"risk_score":0.58,"confidence":0.82,"label":"warning","timestamp":"2026-03-01T12:00:00.000Z"}
  }' | node -e "process.stdin.on('data', d => process.stdout.write(JSON.parse(d).actionId))")
curl -s -X POST http://localhost:4000/api/action/escalate -H 'Content-Type: application/json' -d "{\"actionId\":\"${ACTION_REVIEW}\",\"actor\":\"governance-lead\"}"
curl -s -X POST http://localhost:4000/api/action/approve -H 'Content-Type: application/json' -d "{\"actionId\":\"${ACTION_REVIEW}\",\"actor\":\"governance-lead\"}"
curl -s http://localhost:4000/api/governance/actions/${ACTION_REVIEW}

# stale-state truthfulness proof
# stop ML service or force adapter failure, then observe stale_state=true in ws tick payloads
# ws://localhost:4000/ws/signals -> {"source":"adapter.marketData","timestamp":"...","stale_state":true,"stale_reason":"FETCH_ERROR:..."}

# upstream non-200 handling proof
# point ML_URL to a stub that returns 503 on /infer, then:
curl -s -X POST http://localhost:4000/api/ensemble \
  -H 'Content-Type: application/json' \
  -d '{"features":[0.1,0.4,0.2,0.3,0.8,0.2,0.5,0.9]}'
# verify response includes:
# ml_contract.validation_error="ML_UPSTREAM_NON_200:503"
# ml_contract.fallback_reason="ML_UPSTREAM_NON_200:503"
```

## Fallback (no Docker)
### Start ML service
```bash
cd ml_service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

### Start backend
```bash
cd backend
npm install
ML_URL=http://localhost:8000 npm run dev
npm test
```

### Start frontend (Vite)
```bash
cd frontend
npm install
VITE_API_URL=http://localhost:4000 npm run dev
```
