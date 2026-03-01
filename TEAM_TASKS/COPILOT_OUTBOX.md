# COPILOT OUTBOX

## Packet
- packet_id: ARCH-CORE-P2
- branch: lane/orchestrator/next-packet
- commit: 1d71651 — test(arch-core): add integration coverage for fusion + v2 compat routes

## Summary
Added 42 integration tests (vitest + supertest) covering the fusion endpoint, tri-state stale_state at the API layer, and all three v2 compatibility routes. Guarded `server.listen` for test imports. Appended curl proofs and coverage table to INTEGRATION_CHECKLIST.md.

## Files Changed
- `backend/test/integration/fusion.routes.test.js` — **new** (42 integration tests)
- `backend/src/index.js` — guard `server.listen` in test env; export `app`
- `backend/package.json` — added `supertest` devDependency
- `docs/INTEGRATION_CHECKLIST.md` — appended test evidence, curl proofs, stale_state table

## Contract Checks
- required fields present: ✅ (6 tests validate all 8 fields on every response)
- stale_state tri-state: ✅ (6 API-level tests: fresh / stale / unknown-no-ts / unknown-bad-ts / unknown-no-ml / enum check)
- v2 compatibility preserved: ✅ (24 tests across 3 routes; leak check confirms no fusion fields in legacy shape)

## Tests
- command: `npx vitest run test/integration/fusion.routes.test.js`
- result: 42/42 passing, 0 errors, 178 ms

```
 ✓ test/integration/fusion.routes.test.js (42 tests) 178ms
   ✓ POST /api/governance/fusion (12)
   ✓ Fusion stale_state tri-state via API (6)
   ✓ v2 compat routes (legacy shape) (24)

 Test Files  1 passed (1)
      Tests  42 passed (42)
```

## Proofs

### allow
```json
{
  "ok": true,
  "decision": "allow",
  "reason_tags": ["RISK_WITHIN_POLICY", "ML_OUTPUT_ABSENT", "FUSED_RISK_ACCEPTABLE"],
  "risk_category": "low",
  "risk_score": 0.0833,
  "uncertainty": 0.62,
  "source": "policy-only",
  "timestamp": "2026-03-01T06:21:33.816Z",
  "stale_state": "unknown",
  "stale": true
}
```

### review
```json
{
  "ok": true,
  "decision": "review",
  "reason_tags": ["POLICY_ML_DISAGREEMENT", "CRITICAL_PATH_CHANGE", "PRODUCTION_TARGET", "POLICY_BLOCK_THRESHOLD", "FUSED_REVIEW_REQUIRED"],
  "risk_category": "high",
  "risk_score": 0.715,
  "source": "policy+ml",
  "timestamp": "2026-03-01T06:21:41.628Z",
  "stale_state": "fresh",
  "stale": false
}
```

### block
```json
{
  "ok": true,
  "decision": "block",
  "reason_tags": ["MISSING_TEST_EVIDENCE", "CRITICAL_PATH_CHANGE", "PRODUCTION_TARGET", "DESTRUCTIVE_OPERATION", "NO_ROLLBACK_PLAN", "POLICY_BLOCK_THRESHOLD", "FUSED_BLOCK_THRESHOLD"],
  "risk_category": "critical",
  "risk_score": 0.947,
  "source": "policy+ml",
  "timestamp": "2026-03-01T06:21:47.605Z",
  "stale_state": "fresh",
  "stale": false
}
```

## Rollback
1. Revert `backend/src/index.js` to remove `export { app }` and restore unconditional `server.listen`.
2. Delete `backend/test/integration/fusion.routes.test.js`.
3. Remove `supertest` from `package.json` devDependencies.
4. No other files affected; fusion module and legacy routes untouched.
