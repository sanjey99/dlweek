# Policy Rules (BE-P1 to BE-P3)

## Endpoint
- Primary: `POST /api/governance/policy-gate`
- Compatibility aliases:
  - `POST /api/policy/gate`
  - `POST /api/risk/gate`

## BE-P2 Enforcement Path Endpoints
- `POST /api/governance/actions/propose`
  - Evaluates policy gate and stores governed action state.
- `POST /api/action/approve`
- `POST /api/action/block`
- `POST /api/action/escalate`
- `GET /api/governance/actions/:actionId`
  - Returns action state + event log for auditability.

## BE-P3 Lifecycle Integrity
- Transition guardrails are enforced:
  - `pending_review` -> `approve|block|escalate`
  - `approved_auto` -> no further transitions (terminal)
  - `escalated` -> `approve|block`
  - `blocked` -> no further transitions (terminal)
  - terminal states (`approved_by_human`, `blocked_by_human`) reject further transitions
- Invalid transitions fail safely with `409` and no state mutation.
- Audit events are append-only style with:
  - monotonic `seq`
  - hash chain (`prevHash`, `hash`)
  - immutable frozen event records

## Fusion Evaluator (ARCH-CORE v2) — Decision Source-of-Truth

### Endpoint
- **Primary**: `POST /api/governance/fusion`
- **Legacy-via-Fusion (v2 compat)**:
  - `POST /api/governance/policy-gate/v2`
  - `POST /api/policy/gate/v2`
  - `POST /api/risk/gate/v2`

### Input Contract
```json
{
  "action": { "type": "deploy-prod" },
  "context": {
    "riskScore": 0.72,
    "mlConfidence": 0.8,
    "testsPassing": true,
    "touchesCriticalPaths": true,
    "targetEnvironment": "prod",
    "destructive": false,
    "rollbackPlanPresent": true,
    "hasHumanApproval": false
  },
  "ml_output": {
    "risk_score": 0.65,
    "uncertainty": 0.2,
    "label": "anomaly",
    "decision": "review",
    "timestamp": "2026-03-01T12:00:00.000Z"
  }
}
```

> `ml_output` is optional.  When absent, the evaluator runs in **policy-only** mode.

### Output Contract (Fusion Envelope)
| Field            | Type       | Description                                              |
|------------------|------------|----------------------------------------------------------|
| `decision`       | `string`   | `allow` \| `review` \| `block`                          |
| `reason_tags`    | `string[]` | Array of policy/ML/fusion tags explaining the decision   |
| `risk_category`  | `string`   | `low` \| `medium` \| `high` \| `critical`               |
| `risk_score`     | `number`   | 0..1 fused risk score                                    |
| `uncertainty`    | `number`   | 0..1 confidence uncertainty                              |
| `source`         | `string`   | `policy+ml` \| `policy+ml(stale)` \| `policy-only` \| `ml-only` |
| `timestamp`      | `string`   | ISO 8601 evaluation timestamp                            |
| `stale_state`    | `string`   | `fresh` \| `stale` \| `unknown` — tri-state ML freshness |
| `threshold_ms`   | `number`   | Configured staleness threshold in ms (default 60 000)    |
| `stale`          | `boolean`  | Backward-compat flag: `true` when `stale_state !== 'fresh'` |
| `policy_version` | `string`   | Semantic version of the policy logic (e.g. `"1.1.0"`)    |
| `model_version`  | `string`   | ML model version from `ml_output`, or `"unavailable"`    |
| `detail`         | `object`   | Breakdown of policy / ML sub-evaluations                 |

### Decision Logic
0. **Hard-policy constraints** (run FIRST — ML cannot override):
   - `DELETE_RESOURCE` + `prod` + `destructive` → immediate block.
   - `ROTATE_SECRET` + `prod` + no human approval → immediate block.
   - Returns `risk_score: 1`, `risk_category: "critical"`, `source: "policy-only"`.
1. **Policy gate** runs deterministic risk scoring (action-type baselines + context modifiers).
2. **ML output** supplies `risk_score`, `uncertainty`, `label`, optional `decision` hint.
3. **Fusion weights**: Policy 60% / ML 40%.  When ML data is stale, policy rises to 85%.
4. **Thresholds**: `>= 0.8` → block · `>= 0.45` → review · below → allow.
5. **Escalation**: ML `anomaly` label + `allow` → escalated to `review`.
6. **Human override**: `hasHumanApproval` can downgrade non-extreme blocks (`< 0.85`) to review.
7. **Uncertainty guard**: `allow` + `uncertainty >= 0.5` + `risk_score >= 0.3` → escalated to `review`. High uncertainty cannot auto-allow non-trivial risk.

### Staleness Detection (tri-state)
- `stale_state: "fresh"` — ML timestamp within `threshold_ms` (default 60 000 ms, configurable via `FUSION_STALE_THRESHOLD_MS` env var).
- `stale_state: "stale"` — ML timestamp older than threshold.
- `stale_state: "unknown"` — ML output absent, timestamp missing, or timestamp unparseable.
- Boolean `stale` field preserved for backward compat (`true` when `stale_state !== 'fresh'`).
- When stale/unknown, the `source` field reads `policy+ml(stale)` and policy weight increases to 85%.

### Reason Tags (superset)
| Tag | Origin |
|-----|--------|
| `MISSING_TEST_EVIDENCE` | Policy |
| `CRITICAL_PATH_CHANGE` | Policy |
| `PRODUCTION_TARGET` | Policy |
| `DESTRUCTIVE_OPERATION` | Policy |
| `NO_ROLLBACK_PLAN` | Policy |
| `HUMAN_APPROVAL_PRESENT` | Policy |
| `RISK_WITHIN_POLICY` | Policy |
| `REQUIRES_HUMAN_REVIEW` | Policy |
| `POLICY_BLOCK_THRESHOLD` | Policy |
| `POLICY_ML_DISAGREEMENT` | Fusion |
| `ML_ANOMALY_ESCALATION` | Fusion |
| `HUMAN_APPROVAL_OVERRIDE` | Fusion |
| `ML_DATA_STALE` | Fusion |
| `ML_DATA_UNKNOWN` | Fusion |
| `ML_OUTPUT_ABSENT` | Fusion |
| `FUSED_RISK_ACCEPTABLE` | Fusion |
| `FUSED_REVIEW_REQUIRED` | Fusion |
| `FUSED_BLOCK_THRESHOLD` | Fusion |
| `HARD_POLICY_BLOCK` | Hard policy |
| `HARD_BLOCK_DESTRUCTIVE_PROD_DELETE` | Hard policy |
| `HARD_BLOCK_UNAPPROVED_SECRET_ROTATION` | Hard policy |
| `UNCERTAINTY_GUARD_ESCALATION` | Fusion |

---

## Legacy Policy-Gate Contract (unchanged)

### Input Contract
```json
{
  "action": { "type": "deploy-prod" },
  "context": {
    "riskScore": 0.72,
    "mlConfidence": 0.8,
    "testsPassing": true,
    "touchesCriticalPaths": true,
    "targetEnvironment": "prod",
    "destructive": false,
    "rollbackPlanPresent": true,
    "hasHumanApproval": false
  }
}
```

### Decision Contract
The endpoint always returns:
- `decision`: `allow` | `review` | `block`
- `reasonTags`: array of policy/guardrail tags
- `confidence`: decision/policy/model confidence values (0..1)
- `risk`: combined rule/model risk scores

For BE-P2 action lifecycle endpoints, this contract is enforced consistently as top-level fields on proposal and resolution responses.

## Strict ML Contract Consumption (BE-P3)
- Expected ML payload fields:
  - `risk_score` (number)
  - `confidence` (number)
  - `label` (string)
  - `timestamp` (ISO-8601 string)
- If ML payload is invalid/missing:
  - governance propose path falls back safely to bounded defaults
  - response includes `ml_contract.used_fallback=true`
  - `realtime.stale_state=true` and reason tags include `ML_CONTRACT_FALLBACK_USED`
- `/api/infer` fails safely with `502` and fallback payload when ML response contract is invalid.
- `/api/ensemble` handles ML upstream non-200 explicitly and surfaces fallback reason via:
  - `ml_contract.validation_error` (for example `ML_UPSTREAM_NON_200:503`)
  - `ml_contract.fallback_reason` + `anomaly.fallback_reason`

## Realtime Integrity Contract (BE-P3)
- Realtime feed frames include:
  - `source`
  - `timestamp`
  - `stale_state`
- Additional truthfulness metadata:
  - `stale_reason`
  - `age_ms`
  - `stale_due_to_age`
- On upstream fetch failure, system emits stale frames with cached/last payload and clear stale reason (no fake-live masking).

## Contract Sync Note
- Backend now consumes ML outputs via strict contract adapter (`mlContract`) and normalizes fields for governance decisions.
- Field aliases from old context (`riskScore`, `mlConfidence`) remain accepted only as fallback seeds to preserve migration compatibility.

## Rollback Note
- BE-P3 changes are additive modules (`mlContract`, `realtimeIntegrity`) with no route removals.
- Safe rollback path: revert BE-P3 commit to restore prior BE-P2 behavior while keeping existing endpoint surface.

## Core Rule Signals
- Base risk by action type (safe reads/comments lower, production/deletion higher)
- Risk uplift on missing tests, critical-path changes, production target, destructive operations, or missing rollback plan
- Blended score from deterministic policy risk and model-provided risk
- Human approval can downgrade non-extreme blocks to review

## Finance Legacy Adapter (DP1)
- **Endpoint**: `POST /api/governance/fusion/finance`
- Accepts old finance-style payloads: `{ transaction_type, amount, currency, account_id, risk_flags, ... }`
- Automatically maps to fusion input: `{ action: { type: transaction_type }, context: { amount, currency, ... } }`
- Logs a `[DEPRECATION]` warning to stderr for migration visibility.
- Response includes `_deprecated: true` and `_migration_note` fields.
- Falls through to standard fusion if no finance keys detected.

## Migration Strategy
- Revamp in place: existing backend routes remain unchanged
- New fusion endpoint added as an additive API at `/api/governance/fusion`
- Legacy `/v2` aliases route through fusion engine but return the old response shape
- Legacy finance adapter at `/api/governance/fusion/finance` for finance consumers
- Original `/api/governance/policy-gate` remains untouched for rollback safety
- Compatibility aliases keep old naming conventions functional during frontend/ML migration

## Rollback Plan
1. Revert the fusion import + route registration in `backend/src/index.js`.
2. No changes needed to `policyGate.js` or `ensemble.js` — they are read-only dependencies.
3. Remove `backend/src/fusion/` directory.
4. Original routes (`/api/governance/policy-gate`, `/api/policy/gate`, `/api/risk/gate`) are **never modified** and remain functional.
