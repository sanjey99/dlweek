# Deploy Ready Checklist (Sentinel MVP)

A build is deploy-ready only if all checks below pass.

## Code & Build
- [ ] Frontend build passes (`cd frontend && npm install && npm run build`)
- [ ] Backend starts without runtime errors
- [ ] ML service starts without runtime errors
- [ ] No unresolved merge conflicts

## Core Sentinel Endpoints
- [ ] `GET /health` returns ok
- [ ] `POST /api/governance/policy-gate` responds with governance decision
- [ ] `POST /api/governance/fusion` responds with fused decision + reason tags
- [ ] `POST /api/governance/actions/propose` creates reviewable action
- [ ] `POST /api/action/approve` transitions action to approved
- [ ] `POST /api/action/block` transitions action to blocked
- [ ] `GET /api/governance/actions/:actionId` returns lifecycle + audit trail
- [ ] `WS /ws/signals` emits source/timestamp/stale-state truth fields

## Frontend UX (MVP-critical)
- [ ] Human-in-the-loop review queue works end-to-end
- [ ] Review panel has exactly two decision CTAs: Approve + Reject/Block
- [ ] Loading / stale / error / review / blocked / approved states are visible and clear
- [ ] Live panels show source + timestamp + stale indicator
- [ ] Mobile pass on 390x844, 375x812, 430x932
- [ ] No dead controls in demo-critical flow

## MVP Decision Scope (Explicit)
- [ ] Escalate is **not used in MVP UI flow**
- [ ] If `/api/action/escalate` remains in backend, docs mark it as compatibility-only

## Reliability
- [ ] Buttons disabled while request is in-flight
- [ ] Failed API calls show readable/actionable errors
- [ ] Demo fallback path exists for ML degradation

## Docs
- [ ] `docs/RUNBOOK.md` contains startup + smoke tests for Sentinel flow
- [ ] `README.md` reflects Sentinel purpose/problem/features (no finance framing)
- [ ] `docs/UI_STATES.md` matches implemented behavior

## Git/Branch
- [ ] Branch pushed and synced
- [ ] PR to main created (or main updated per team decision)
- [ ] Last 3 commits have clear messages

Set `READY_FOR_DEPLOY=true` in `COPILOT_OUTBOX.md` only after every checkbox is complete.
