# Integration Checklist — Fusion Evaluator (ARCH-CORE v2)

## Pre-Deploy

- [x] `backend/src/fusion/fusionEvaluator.js` — core evaluation logic
- [x] `backend/src/fusion/schema.js` — payload validation + response shape assertion
- [x] `backend/src/fusion/compatAdapter.js` — legacy request/response shape adapters
- [x] `backend/src/index.js` — new `/api/governance/fusion` route registered
- [x] Legacy routes (`/api/governance/policy-gate`, `/api/policy/gate`, `/api/risk/gate`) **untouched**
- [x] `/v2` compat routes added: same request → fusion-backed, legacy-shaped response
- [x] `docs/POLICY_RULES.md` — updated with fusion schema and decision logic
- [x] `docs/DELIVERY_PLAN.md` — created with phased rollout timeline
- [x] `docs/MISTAKES_LEARNINGS.md` — self-repair log initialized

## Endpoint Matrix

| Route | Backed By | Response Shape | Status |
|-------|-----------|----------------|--------|
| `POST /api/governance/fusion` | Fusion Evaluator | Fusion envelope | **New** |
| `POST /api/governance/policy-gate` | Policy Gate (direct) | Legacy | Unchanged |
| `POST /api/policy/gate` | Policy Gate (direct) | Legacy | Unchanged |
| `POST /api/risk/gate` | Policy Gate (direct) | Legacy | Unchanged |
| `POST /api/governance/policy-gate/v2` | Fusion → compat adapter | Legacy | **New** |
| `POST /api/policy/gate/v2` | Fusion → compat adapter | Legacy | **New** |
| `POST /api/risk/gate/v2` | Fusion → compat adapter | Legacy | **New** |

## Acceptance Criteria

- [x] **curl allow**: `action.type = "READ"`, low-risk context → `decision: "allow"`
- [x] **curl review**: `action.type = "DEPLOY_PROD"`, moderate ML risk → `decision: "review"`
- [x] **curl block**: `action.type = "DELETE_RESOURCE"`, high ML risk, destructive → `decision: "block"`
- [x] **Schema stable**: all 8 required output fields present (`decision`, `reason_tags`, `risk_category`, `risk_score`, `uncertainty`, `source`, `timestamp`, `stale_state`)
- [x] **Source truthful**: `source` accurately reflects whether ML was provided / stale
- [x] **Timestamp truthful**: `timestamp` is server-side evaluation time
- [x] **stale_state truthful**: reflects actual ML timestamp age (> 60 s = stale)
- [x] **Compatibility**: legacy routes return identical shape to before

## Rollback

1. Revert imports + route registrations in `backend/src/index.js`
2. Delete `backend/src/fusion/` directory
3. Original routes are never modified → no further rollback needed
4. No database migrations to revert

## Compatibility Notes

- `policyGate.js` and `ensemble.js` are **read-only dependencies** of the fusion module; no changes made.
- Frontend callers using `/api/governance/policy-gate` are unaffected.
- The `/v2` compat routes can be promoted to replace originals once validated.
- `ml_output` is optional in the fusion payload; omitting it degrades gracefully to `policy-only` mode.


## Release Gate v2 — Cross-Lane Validation Matrix (QA-DP1)

### Legend
- Status: PASS / FAIL / BLOCKED / PENDING
- Evidence: path/link to logs, screenshots, clips

| Test ID | Scenario | ML Expected | Backend Expected | UI Expected | Actual | Status | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|
| INT-01 | Happy path (allow) | valid score + fresh ts | persisted allow state | allow shown, next-step enabled | TBD | PENDING | evidence/int-01/ | |
| INT-02 | Review edge threshold | boundary confidence | review_required=true | review gate shown | TBD | PENDING | evidence/int-02/ | |
| INT-03 | Block path | high-risk trigger | block + reason persisted | block banner + locked action | TBD | PENDING | evidence/int-03/ | |
| INT-04 | Stale feed | stale ts (> policy) | stale_state=true + lock | stale badge + confirm disabled | TBD | PENDING | evidence/int-04/ | |
| INT-05 | Injected timeout | normal ML | timeout handled, no false success | retry/error UX visible | TBD | PENDING | evidence/int-05/ | |
| INT-06 | Contract mismatch | missing/renamed field | schema catch / safe fallback | graceful error, no crash | TBD | PENDING | evidence/int-06/ | |
| INT-07 | Out-of-order events | older arrives late | no state regression | latest state retained | TBD | PENDING | evidence/int-07/ | |
| INT-08 | Recovery after failure | retry with valid input | state reconciled | healthy UI restored | TBD | PENDING | evidence/int-08/ | |

### Release Gate Decision
- Decision: **PENDING** (GO / NO-GO)
- Rationale:
- Date:
- Owner:

#### Blockers (hard stop)
- [ ] <item + owner + fix recommendation + severity>

#### Risks (known, mitigated)
- [ ] <item + mitigation>

#### Fallbacks / Recovery
- [ ] <operator fallback path>
- [ ] <rollback/read-only demo option>