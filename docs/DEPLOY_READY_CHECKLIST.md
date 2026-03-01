# Deploy Ready Checklist (Hackathon)

A build is considered deploy-ready **only if all checks below pass**.

## Code & Build
- [ ] Frontend build passes (`cd frontend && npm install && npm run build`)
- [ ] Backend starts without runtime errors
- [ ] ML service starts without runtime errors
- [ ] No unresolved merge conflicts

## Endpoints
- [ ] `GET /health` returns ok
- [ ] `GET /api/system/status` returns backend/ml/ws status
- [ ] `POST /api/portfolio/optimize` returns full metrics + recommendation
- [ ] `GET /api/stocks/picker` returns picks + rejected reasons
- [ ] `POST /api/fraud/scan` returns per-transaction + account-level outputs

## Frontend UX
- [ ] Portfolio tab is default landing tab
- [ ] Stock picker tab refreshes at 5-minute interval
- [ ] Fraud tab supports CSV upload and scan
- [ ] Loading/error/empty states visible and clean
- [ ] Demo marker visible: `Hackathon build – deploy ready`

## Reliability
- [ ] Buttons disabled while request in-flight
- [ ] Failed API calls show readable messages (no blank screen)
- [ ] Demo mode/fallback path is available

## Docs
- [ ] `docs/RUNBOOK.md` has startup + smoke test commands
- [ ] `README.md` includes known limitations and deploy steps

## Git/Branch
- [ ] Work branch pushed and synced
- [ ] PR to main created or main directly updated (team decision)
- [ ] Last 3 commits have clear messages

---

Set `READY_FOR_DEPLOY=true` in `COPILOT_OUTBOX.md` only after every checkbox is done.
