# PACKET: ARCH-CORE-P2

## Objective
Add integration coverage + proof harness for fusion evaluator and v2 compatibility routes.

## Required Routes
- POST /api/governance/fusion
- POST /api/governance/policy-gate/v2
- POST /api/policy/gate/v2
- POST /api/risk/gate/v2

## Required Assertions
1. Fusion response always includes:
   decision, reason_tags, risk_category, risk_score, uncertainty, source, timestamp, stale_state
2. stale_state tri-state validated:
   fresh | stale | unknown
3. v2 routes return legacy-compatible shape and do not break existing contract.
4. Include proof snippets for allow/review/block.

## Files (expected)
- backend/src/** (only if needed for testability)
- backend/src/fusion/fusionEvaluator.test.js (extend if needed)
- backend/test/integration/fusion.routes.test.js (new, preferred path)
- docs/INTEGRATION_CHECKLIST.md (append proof section)

## Deliverables
- Implementation + tests + docs update
- Command output proving tests pass
- Curl or test proof for allow/review/block

## Commit Message
test(arch-core): add integration coverage for fusion and v2 compat routes
