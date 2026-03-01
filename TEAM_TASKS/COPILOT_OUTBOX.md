# COPILOT OUTBOX

## Packet
- packet_id: ARCH-CORE-DP1
- branch: lane/orchestrator/next-packet
- commit: 6b9e9e8 — feat(arch-core): ARCH-CORE-DP1 fusion decision backbone deploy-ready

## Summary
Deploy-ready fusion evaluator backbone. Added `policy_version` + `model_version` fields, hard-policy-first guard (destructive prod delete, unapproved secret rotation → immediate block before ML), uncertainty guard (high uncertainty + non-trivial risk → escalate to review), legacy finance payload adapter (`/api/governance/fusion/finance` with deprecation logging), updated all 4 docs, 68 tests passing.

## Files Changed
- `backend/src/fusion/fusionEvaluator.js` — added POLICY_VERSION, HARD_BLOCK_RULES, uncertainty guard, model_version extraction
- `backend/src/fusion/schema.js` — added policy_version + model_version to required fields + shape assertion
- `backend/src/fusion/compatAdapter.js` — added `legacyFinanceToFusion()` adapter with deprecation warning
- `backend/src/index.js` — wired finance adapter import + `/api/governance/fusion/finance` route
- `backend/src/fusion/fusionEvaluator.test.js` — expanded from 5 → 14 unit tests (version, hard-block, uncertainty)
- `backend/test/integration/fusion.routes.test.js` — expanded from 42 → 54 integration tests (DP1 suites)
- `docs/POLICY_RULES.md` — new fields table, hard-policy section, uncertainty guard, finance adapter, new reason tags
- `docs/INTEGRATION_CHECKLIST.md` — DP1 acceptance criteria, finance endpoint in matrix, updated test evidence
- `docs/DELIVERY_PLAN.md` — Phase 2 tasks marked done
- `docs/MISTAKES_LEARNINGS.md` — 2 entries (hard-block test breakage, finance key collision)

## Contract Checks
- policy_version present: ✅ (`"1.1.0"`)
- model_version present: ✅ (extracted from ml_output or `"unavailable"`)
- hard-policy-first: ✅ (destructive prod DELETE → block, risk=1, before ML)
- uncertainty guard: ✅ (allow + uncertainty≥0.5 + risk≥0.3 → review)
- finance adapter: ✅ (deprecation logged, `_deprecated: true` in response)
- legacy compat unchanged: ✅ (v2 routes still return legacy shape)

## Tests
- command: `npx vitest run`
- result: 68/68 passing (14 unit + 54 integration)

## Proofs

### allow
```json
{ "decision": "allow", "policy_version": "1.1.0", "model_version": "unavailable", "risk_score": 0.0833, "source": "policy-only" }
```

### review
```json
{ "decision": "review", "policy_version": "1.1.0", "model_version": "xgb-v3.2.1", "risk_score": 0.715, "source": "policy+ml" }
```

### block (hard-policy)
```json
{ "decision": "block", "policy_version": "1.1.0", "model_version": "anomaly-detect-v2", "risk_score": 1, "reason_tags": ["HARD_BLOCK_DESTRUCTIVE_PROD_DELETE", "HARD_POLICY_BLOCK"] }
```

### finance adapter
```json
{ "decision": "review", "policy_version": "1.1.0", "_deprecated": true, "_migration_note": "Migrate to POST /api/governance/fusion..." }
```
