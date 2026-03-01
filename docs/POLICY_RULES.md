# Policy Rules (BE-P1)

## Endpoint
- Primary: `POST /api/governance/policy-gate`
- Compatibility aliases:
  - `POST /api/policy/gate`
  - `POST /api/risk/gate`

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
| Field           | Type       | Description                                              |
|-----------------|------------|----------------------------------------------------------|
| `decision`      | `string`   | `allow` \| `review` \| `block`                          |
| `reason_tags`   | `string[]` | Array of policy/ML/fusion tags explaining the decision   |
| `risk_category` | `string`   | `low` \| `medium` \| `high` \| `critical`               |
| `risk_score`    | `number`   | 0..1 fused risk score                                    |
| `uncertainty`   | `number`   | 0..1 confidence uncertainty                              |
| `source`        | `string`   | `policy+ml` \| `policy+ml(stale)` \| `policy-only` \| `ml-only` |
| `timestamp`     | `string`   | ISO 8601 evaluation timestamp                            |
| `stale_state`   | `string`   | `fresh` \| `stale` \| `unknown` — tri-state ML freshness |
| `threshold_ms`  | `number`   | Configured staleness threshold in ms (default 60 000)    |
| `stale`         | `boolean`  | Backward-compat flag: `true` when `stale_state !== 'fresh'` |
| `detail`        | `object`   | Breakdown of policy / ML sub-evaluations                 |

### Decision Logic
1. **Policy gate** runs deterministic risk scoring (action-type baselines + context modifiers).
2. **ML output** supplies `risk_score`, `uncertainty`, `label`, optional `decision` hint.
3. **Fusion weights**: Policy 60% / ML 40%.  When ML data is stale, policy rises to 85%.
4. **Thresholds**: `>= 0.8` → block · `>= 0.45` → review · below → allow.
5. **Escalation**: ML `anomaly` label + `allow` → escalated to `review`.
6. **Human override**: `hasHumanApproval` can downgrade non-extreme blocks (`< 0.85`) to review.

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

## Core Rule Signals
- Base risk by action type (safe reads/comments lower, production/deletion higher)
- Risk uplift on missing tests, critical-path changes, production target, destructive operations, or missing rollback plan
- Blended score from deterministic policy risk and model-provided risk
- Human approval can downgrade non-extreme blocks to review

## Migration Strategy
- Revamp in place: existing backend routes remain unchanged
- New fusion endpoint added as an additive API at `/api/governance/fusion`
- Legacy `/v2` aliases route through fusion engine but return the old response shape
- Original `/api/governance/policy-gate` remains untouched for rollback safety
- Compatibility aliases keep old naming conventions functional during frontend/ML migration

## Rollback Plan
1. Revert the fusion import + route registration in `backend/src/index.js`.
2. No changes needed to `policyGate.js` or `ensemble.js` — they are read-only dependencies.
3. Remove `backend/src/fusion/` directory.
4. Original routes (`/api/governance/policy-gate`, `/api/policy/gate`, `/api/risk/gate`) are **never modified** and remain functional.
