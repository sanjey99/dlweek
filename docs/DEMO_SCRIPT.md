# End-to-End Demo Script (Deploy Handoff)

## A. Prerequisites
- Python: 3.10+ recommended.
- Dependencies: install from project requirements before running the API (for example, FastAPI stack plus ML deps used by `ml_service/app.py`).
- Run location: repository root `sanjey99/dlweek`.
- Model file behavior: if `ml_service/risk_model.pt` exists and loads, `/classify` uses model inference (`model_version` like `risk-mlp-v2`); if missing/unavailable/error, API returns deterministic fallback response.

## B. Start Service
PowerShell (from repo root):

```powershell
python -m uvicorn ml_service.app:app --host 127.0.0.1 --port 8000 --reload
```

## C. Health Check
PowerShell request:

```powershell
Invoke-RestMethod -Method GET -Uri "http://127.0.0.1:8000/health"
```

Expected response (example):

```json
{
  "ok": true,
  "service": "ml_sdlc",
  "ts": "2026-03-01T00:00:00+00:00"
}
```

## D. Normal Inference Demo
Send one `/classify` request:

```powershell
$body = @{
  text = "create harmless dashboard report"
  features = @(0.1, 0.2, 0.0, 0.0)
} | ConvertTo-Json

Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:8000/classify" -ContentType "application/json" -Body $body
```

Expected output keys:
- `risk_category`
- `risk_score`
- `uncertainty`
- `recommendation`
- `reason_tags`
- `model_version`
- `fallback_used`

## E. Fallback Demo
Simulate model unavailable:

```powershell
Rename-Item ml_service\risk_model.pt risk_model.pt.bak
```

Run `/classify` again using the same request.

Expected fallback behavior:
- `fallback_used = true`
- `reason_tags` is non-empty
- `recommendation = "review"`

Restore model file after demo:

```powershell
Rename-Item ml_service\risk_model.pt.bak risk_model.pt
```

## F. Threshold Summary
- `uncertainty > 0.40` => `review`
- `risk_score >= 0.80` => `block`
- `risk_score < 0.30` => `allow`
- else => `review`

## G. Demo Acceptance Checklist
- [ ] Health endpoint returns OK
- [ ] Success payload contract keys are correct
- [ ] Fallback payload contract keys are correct
- [ ] Deterministic fallback behavior confirmed

## H. Caveats + Rollback Note
- Caveat: local environment may not have all ML/runtime dependencies (for example, missing `torch`), which can affect live inference validation; CI remains source of truth.
- Rollback: revert this docs commit if needed.
