# Policy Rules (BE-P1)

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

## Input Contract
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

## Decision Contract
The endpoint always returns:
- `decision`: `allow` | `review` | `block`
- `reasonTags`: array of policy/guardrail tags
- `confidence`: decision/policy/model confidence values (0..1)
- `risk`: combined rule/model risk scores

For BE-P2 action lifecycle endpoints, this contract is enforced consistently as top-level fields on proposal and resolution responses.

## Core Rule Signals
- Base risk by action type (safe reads/comments lower, production/deletion higher)
- Risk uplift on missing tests, critical-path changes, production target, destructive operations, or missing rollback plan
- Blended score from deterministic policy risk and model-provided risk
- Human approval can downgrade non-extreme blocks to review

## Migration Strategy
- Revamp in place: existing backend routes remain unchanged
- New governance route added as an additive API
- Compatibility aliases keep old naming conventions functional during frontend/ML migration
