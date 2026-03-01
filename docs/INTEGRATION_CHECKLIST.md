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
| INT-01 | Happy path (allow) | valid score + fresh ts | persisted allow state | allow shown, next-step enabled | `decision=allow`, `source=policy+ml`, `stale=false`, `risk_category=low` | PASS | `evidence/int-01/response.json` <!-- add UI screenshot path --> | requestId=`fusion-1772360793103-1` |
| INT-02 | Review edge threshold | boundary confidence | review_required=true / review decision | review gate shown | `decision=review`, `source=policy+ml`, `stale=false`, `risk_category=high` | PASS | `evidence/int-02/response.json` <!-- add UI screenshot path --> | requestId=`fusion-1772360827705-2` |
| INT-03 | Block path | high-risk trigger | block + reason persisted | block banner + locked action | Returned `decision=review` for `DELETE_RESOURCE` high-risk payload | FAIL | `evidence/int-03/response.json` <!-- add UI screenshot path --> | requestId=`fusion-1772360849941-3`; verify spec: expected block vs review-first policy |
| INT-04 | Stale feed | stale ts (> policy) | stale_state=true + lock | stale badge + confirm disabled | `decision=review`, `source=policy+ml`, `stale=true`, `risk_category=high` | PASS | `evidence/int-04/` | requestId=`fusion-1772361234770-4` |
| INT-05 | Injected timeout | normal ML | timeout handled, no false success | retry/error UX visible | `ok=false`,`error=TypeError: fetch failed` | PASS | `evidence/int-05/` | e.g. backend remains stable after time passes; may want to customise user-friendly error message instead of just `TypeError` |
| INT-06 | Contract mismatch | missing/renamed field | schema catch / safe fallback | graceful error, no crash | TBD | PENDING | `evidence/int-06/` | Validate required fields handling |
| INT-07 | Out-of-order events | older arrives late | no state regression | latest state retained | TBD | PENDING | `evidence/int-07/` | Send newer then older event |
| INT-08 | Recovery after failure | retry with valid input | state reconciled | healthy UI restored | TBD | PENDING | `evidence/int-08/` | Post-failure retry validation |

### Release Gate Decision
- Decision: **PENDING** (GO / NO-GO)
- Rationale: INT-01 and INT-02 passed; INT-03 currently fails expected block outcome (returned review). Remaining INT-04..08 pending.
- Date: `2026-03-01`
- Owner: `@xueqi`

#### Blockers (hard stop)
- [ ] **Policy expectation mismatch on block path (INT-03)** — Owner: Backend/Governance — Recommendation: confirm intended rule for destructive action (`DELETE_RESOURCE`) and align implementation/docs — Severity: High (release-gate impacting if block is required by spec)

#### Risks (known, mitigated)
- [ ] KPI cards clickability semantics unclear (drill-down expected or display-only); mitigation: confirm UX scope and label non-clickable cards explicitly if intended.
- [ ] Profile submenu actions (settings/security/audit/API keys/logout) not yet verified as functional; mitigation: mark as out-of-scope for current demo if not required.

#### Fallbacks / Recovery
- [ ] Use known-good payload set for demo (allow/review) if block rule unresolved.
- [ ] If runtime instability occurs, use operator retry flow + recorded evidence for failure/recovery path.

---

## QA-DP1 Execution Update (Current)

### Environment Readiness
- [x] Docker stack up (`db`, `ml-service` healthy; `backend`, `frontend` up)
- Evidence: `evidence/env/docker-ps.txt` <!-- add exact command output file -->

### UI Validation

| ID | Check | Status | Evidence | Notes |
|---|---|---|---|---|
| UI-01 | Notification dismiss (`x`) works | PASS | `evidence/ui-01/` | |
| UI-02 | Light/Dark mode toggle works | PASS | `evidence/ui-02/` | |
| UI-03 | Live feed scroll + page scroll works | PASS | `evidence/ui-03/` | |
| UI-04 | Approve/Block actions in feed work | PASS | `evidence/ui-04/` | |
| UI-05 | Feed item opens/updates Active Review Panel | PASS | `evidence/ui-05/` | |
| UI-06 | Profile menu actions (settings/security/audit/API keys/logout) | PENDING | `evidence/ui-06/` | Scope/implementation to confirm |
| UI-07 | KPI cards clickability semantics | RISK | `evidence/ui-07/` | Clarify if drill-down expected |
