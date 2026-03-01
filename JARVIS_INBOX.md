# JARVIS_INBOX.md

> Copilot worker reads this file first each cycle.
> Execute packets in order unless blocked.

## Global rules
- Branch: `autopilot/night-20260228`
- Allowed paths: `frontend/`, `backend/`, `ml_service/`, `docs/`, `data/`
- Do NOT edit secrets/auth configs
- Do NOT force push
- Commit and push after each packet

---

## Packet P-H2 (High)
Status: TODO

Goal:
- Ensure Portfolio Optimisation tab is the default hero flow and fully usable.

Edit only:
- `frontend/src/App.jsx` (or portfolio components)
- `docs/RUNBOOK.md`

Tasks:
1. Portfolio tab must be default on first load.
2. Include input modes: manual, preset, CSV placeholder.
3. Include constraints fields (max_drawdown, max_concentration, min_liquidity, target_return, simulations=1000, horizon_days=30).
4. Primary CTA: `Run Optimisation` calling `POST /api/portfolio/optimize`.
5. Render all outputs: VaR, CVaR, probability_of_loss, expected_return, confidence, error_rate, recommendation, proposed_weights.
6. Add loading/error/empty states and disable CTA while in-flight.

Acceptance:
- [ ] Portfolio is default landing tab.
- [ ] End-to-end optimise flow works.
- [ ] Output panel is readable and complete.

---

## Packet P-S1 (High)
Status: TODO

Goal:
- Implement Real-time Stock Picker analysis (Top 20 universe, 5-min refresh, equal-weight scoring).

Edit only:
- `backend/src/index.js`
- `frontend/src/App.jsx` (or stock picker components)
- `docs/RUNBOOK.md`

Tasks:
1. Add endpoint `GET /api/stocks/picker?universe=top20&refresh=5m`.
2. Return top picks with momentum/value/quality subscores, overall score, confidence, reason tags.
3. Return rejected list with `reason_not_selected`.
4. Frontend Stock Picker tab: top picks table, confidence + reason tags, rejected section.
5. Add auto-refresh every 300s while tab active + manual refresh button.

Acceptance:
- [ ] Endpoint and UI both work.
- [ ] 5-min refresh works.
- [ ] No silent failures.

---

## Packet P-F1 (High)
Status: TODO

Goal:
- Implement Credit Card Fraud Detection from CSV upload.

Edit only:
- `backend/src/index.js`
- `ml_service/app.py`
- `frontend/src/App.jsx` (or fraud components)
- `docs/RUNBOOK.md`

Tasks:
1. Add `POST /api/fraud/scan` (rows payload).
2. Add ML endpoint `POST /fraud/score`.
3. Return per-transaction fraud risk + top suspicious features.
4. Return account-level alert score + action (`block|review|monitor`).
5. Frontend Fraud tab: CSV upload, scan button, suspicious tx table, account alert card.

Acceptance:
- [ ] CSV flow works end-to-end.
- [ ] Per-transaction + account-level outputs visible.
- [ ] Action `block` appears for high-risk cases.

---

## Packet P-Q1 (Medium)
Status: TODO

Goal:
- Reliability pass across all 3 modules.

Edit only:
- `frontend/src/App.jsx` and related frontend components
- `backend/src/index.js`
- `docs/RUNBOOK.md`

Tasks:
1. Add loading/error/empty states across tabs.
2. Disable action buttons during in-flight requests.
3. Add unified error banner.
4. Add `GET /api/system/status` if missing.
5. Update RUNBOOK smoke tests.

Acceptance:
- [ ] No blank screens.
- [ ] Clear status visibility and graceful failures.

---

## Packet P-D1 (Medium)
Status: TODO

Goal:
- Deploy-ready polish.

Edit only:
- `frontend/*`
- `docs/RUNBOOK.md`
- `README.md`

Tasks:
1. Ensure frontend build passes.
2. API base URL env handling documented.
3. Add demo checklist in RUNBOOK.
4. Add known limitations section in README.
5. Add footer marker text: `Hackathon build – deploy ready`.
6. Final outbox line must include `READY_FOR_DEPLOY=true` or blocker details.

Acceptance:
- [ ] Build passes.
- [ ] Docs are enough for teammate setup.
- [ ] Deploy marker visible.

---

## Packet P-R1 (Final Gate)
Status: TODO

Goal:
- Run full deploy gate and mark project status explicitly.

Edit only:
- `COPILOT_OUTBOX.md`
- `docs/DEPLOY_READY_CHECKLIST.md` (checkbox updates only)

Tasks:
1. Execute checks in `docs/DEPLOY_READY_CHECKLIST.md`.
2. Mark completed checkboxes.
3. If all pass, append `READY_FOR_DEPLOY=true` to outbox.
4. If any fail, append `READY_FOR_DEPLOY=false` + exact blockers.

Acceptance:
- [ ] Outbox contains final deploy gate decision.
