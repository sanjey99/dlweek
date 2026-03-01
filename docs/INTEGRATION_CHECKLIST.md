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
| `POST /api/governance/fusion/finance` | Finance adapter → Fusion | Fusion + deprecation | **DP1** |
| `POST /api/governance/policy-gate` | Policy Gate (direct) | Legacy | Unchanged |
| `POST /api/policy/gate` | Policy Gate (direct) | Legacy | Unchanged |
| `POST /api/risk/gate` | Policy Gate (direct) | Legacy | Unchanged |
| `POST /api/governance/policy-gate/v2` | Fusion → compat adapter | Legacy | **New** |
| `POST /api/policy/gate/v2` | Fusion → compat adapter | Legacy | **New** |
| `POST /api/risk/gate/v2` | Fusion → compat adapter | Legacy | **New** |
| `GET /api/governance/fusion/health` | Metrics snapshot | Health envelope | **P3** |
| `GET /api/governance/fusion/audit` | Audit store | Audit list envelope | **P4** |
| `GET /api/governance/fusion/audit/:request_id` | Audit store | Single record | **P4** |

## Acceptance Criteria

- [x] **curl allow**: `action.type = "READ"`, low-risk context → `decision: "allow"`
- [x] **curl review**: `action.type = "DEPLOY_PROD"`, moderate ML risk → `decision: "review"`
- [x] **curl block**: `action.type = "DELETE_RESOURCE"`, high ML risk, destructive → `decision: "block"`
- [x] **Schema stable**: all 10 required output fields present (`decision`, `reason_tags`, `risk_category`, `risk_score`, `uncertainty`, `source`, `timestamp`, `stale_state`, `policy_version`, `model_version`)
- [x] **Source truthful**: `source` accurately reflects whether ML was provided / stale
- [x] **Timestamp truthful**: `timestamp` is server-side evaluation time
- [x] **stale_state truthful**: reflects actual ML timestamp age (> 60 s = stale)
- [x] **Compatibility**: legacy routes return identical shape to before
- [x] **DP1: policy_version**: present in every fusion response as a semver string
- [x] **DP1: model_version**: extracted from ml_output or `"unavailable"`
- [x] **DP1: Hard-policy-first**: destructive prod delete + unapproved secret rotation → immediate block before ML
- [x] **DP1: Uncertainty guard**: high uncertainty + non-trivial risk → escalate allow to review
- [x] **DP1: Finance adapter**: `/api/governance/fusion/finance` accepts legacy finance payloads with deprecation notice
- [x] **P3: Health endpoint**: `GET /api/governance/fusion/health` returns `{ ok, policy_version, model_version_support, metrics }`
- [x] **P3: Structured logging**: every fusion evaluation emits NDJSON log line with requestId, decision, risk_score, etc.
- [x] **P3: Metrics counters**: in-memory counters for decision distribution, staleness, ML presence, errors
- [x] **P3: Request ID**: every fusion response includes `_requestId` for correlation
- [x] **P3: Backward compat**: all existing routes and response shapes unchanged
- [x] **P4: Audit store**: append-only in-memory store with configurable cap (FUSION_AUDIT_MAX, default 5000)
- [x] **P4: Audit write**: every fusion evaluation (POST fusion, v2 compat, finance) writes an audit record
- [x] **P4: Audit list**: `GET /api/governance/fusion/audit?limit=N` returns newest-first, capped records
- [x] **P4: Audit lookup**: `GET /api/governance/fusion/audit/:request_id` returns single record or 404
- [x] **P4: Safety cap**: oldest-drop policy when store hits capacity

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

---

## ARCH-CORE-P2: Integration Test Evidence

### Test Suite
**File**: `backend/test/integration/fusion.routes.test.js`
**Runner**: vitest + supertest
**Result**: 54/54 passing (+ 14 unit tests in `fusionEvaluator.test.js`) = **68 total**

### Coverage Matrix

| Area | Tests | Status |
|------|-------|--------|
| `POST /api/governance/fusion` — schema contract | 6 | ✅ |
| `POST /api/governance/fusion` — allow/review/block | 3 | ✅ |
| `POST /api/governance/fusion` — validation (400s) | 3 | ✅ |
| Fusion stale_state tri-state via API | 6 | ✅ |
| `POST /api/governance/policy-gate/v2` — legacy shape | 8 | ✅ |
| `POST /api/policy/gate/v2` — legacy shape | 8 | ✅ |
| `POST /api/risk/gate/v2` — legacy shape | 8 | ✅ |
| **DP1: policy_version + model_version** | 3 | ✅ |
| **DP1: Hard-policy-first block** | 4 | ✅ |
| **DP1: Uncertainty guard** | 2 | ✅ |
| **DP1: Finance legacy adapter** | 3 | ✅ |
| **P3: Health endpoint** | 2 | ✅ |
| **P3: Metrics counters** | 7 | ✅ |
| **P3: Request ID / logging** | 3 | ✅ |
| **P4: Audit trail list endpoint** | 6 | ✅ |
| **P4: Audit trail lookup endpoint** | 3 | ✅ |
| **P4: Audit store unit tests** | 18 | ✅ |

### Curl Proof — Allow
```bash
curl -X POST http://localhost:4000/api/governance/fusion \
  -H "Content-Type: application/json" \
  -d '{"action":{"type":"READ"},"context":{"testsPassing":true,"rollbackPlanPresent":true,"targetEnvironment":"dev"}}'
```
```json
{
  "ok": true,
  "decision": "allow",
  "reason_tags": ["RISK_WITHIN_POLICY","ML_OUTPUT_ABSENT","FUSED_RISK_ACCEPTABLE"],
  "risk_category": "low",
  "risk_score": 0.0833,
  "uncertainty": 0.62,
  "source": "policy-only",
  "stale_state": "unknown",
  "stale": true
}
```

### Curl Proof — Review
```bash
curl -X POST http://localhost:4000/api/governance/fusion \
  -H "Content-Type: application/json" \
  -d '{"action":{"type":"DEPLOY_PROD"},"context":{"riskScore":0.5,"mlConfidence":0.7,"testsPassing":true,"touchesCriticalPaths":true,"targetEnvironment":"prod","destructive":false,"rollbackPlanPresent":true,"hasHumanApproval":false},"ml_output":{"risk_score":0.55,"uncertainty":0.3,"label":"normal","decision":"review","timestamp":"2026-03-01T06:21:00.000Z"}}'
```
```json
{
  "ok": true,
  "decision": "review",
  "reason_tags": ["POLICY_ML_DISAGREEMENT","CRITICAL_PATH_CHANGE","PRODUCTION_TARGET","POLICY_BLOCK_THRESHOLD","FUSED_REVIEW_REQUIRED"],
  "risk_category": "high",
  "risk_score": 0.715,
  "source": "policy+ml",
  "stale_state": "fresh",
  "stale": false
}
```

### Curl Proof — Block
```bash
curl -X POST http://localhost:4000/api/governance/fusion \
  -H "Content-Type: application/json" \
  -d '{"action":{"type":"DELETE_RESOURCE"},"context":{"riskScore":0.9,"mlConfidence":0.85,"testsPassing":false,"touchesCriticalPaths":true,"targetEnvironment":"prod","destructive":true,"rollbackPlanPresent":false,"hasHumanApproval":false},"ml_output":{"risk_score":0.92,"uncertainty":0.1,"label":"anomaly","decision":"block","timestamp":"2026-03-01T06:21:00.000Z"}}'
```
```json
{
  "ok": true,
  "decision": "block",
  "reason_tags": ["MISSING_TEST_EVIDENCE","CRITICAL_PATH_CHANGE","PRODUCTION_TARGET","DESTRUCTIVE_OPERATION","NO_ROLLBACK_PLAN","POLICY_BLOCK_THRESHOLD","FUSED_BLOCK_THRESHOLD"],
  "risk_category": "critical",
  "risk_score": 0.947,
  "source": "policy+ml",
  "stale_state": "fresh",
  "stale": false
}
```

### stale_state Tri-State Validated at Route Layer
| Scenario | stale_state | stale (bool) | source |
|----------|-------------|--------------|--------|
| Fresh ML timestamp (< 60 s) | `fresh` | `false` | `policy+ml` |
| Stale ML timestamp (> 60 s) | `stale` | `true` | `policy+ml(stale)` |
| ML output with no timestamp | `unknown` | `true` | `policy+ml(stale)` |
| ML output with invalid timestamp | `unknown` | `true` | `policy+ml(stale)` |
| No ML output (policy-only) | `unknown` | `true` | `policy-only` |
