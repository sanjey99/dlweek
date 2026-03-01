# Mistakes & Learnings — Self-Repair Log

> Append-only log.  Follow the loop: reproduce -> root cause -> smallest safe fix -> regression check -> document.

---

## Template

```
### [DATE] — TITLE
**Reproduced**: how the issue was found
**Root cause**: why it happened
**Fix**: what was changed (smallest safe fix)
**Regression check**: how we verified the fix
**Lesson**: what to do differently next time
```

---

### 2026-03-01 — Hard-policy block broke existing PAYLOAD_BLOCK test
**Reproduced**: After adding hard-policy-first guard, the existing integration test "returns block for destructive delete with high ML risk" failed because it expected `FUSED_BLOCK_THRESHOLD` in reason_tags, but the request now triggers the early hard-block path which returns `HARD_POLICY_BLOCK` instead.
**Root cause**: The test payload matched the new hard-policy rule (DELETE_RESOURCE + prod + destructive). The hard-block path returns before fusion scoring runs, so fusion-specific tags are never added.
**Fix**: Updated the test expectation to assert `HARD_POLICY_BLOCK` instead of `FUSED_BLOCK_THRESHOLD`. This accurately reflects the desired DP1 behavior.
**Regression check**: All 68 tests pass (14 unit + 54 integration).
**Lesson**: When adding early-return guard logic, audit all existing test payloads to ensure they still test the intended code path. Hard-policy guards change the decision path for payloads that used to flow through standard fusion.

### 2026-03-01 — Legacy finance adapter key collision risk
**Reproduced**: Design review — finance payloads use flat keys (`transaction_type`, `amount`) while standard fusion uses nested `{ action, context }`. If a consumer sends both shapes, the adapter must choose correctly.
**Root cause**: Ambiguous payload shape detection.
**Fix**: `legacyFinanceToFusion()` checks for finance-specific keys (`transaction_type` or `amount`) first. If not found, returns `{ fusionInput: null }` and the route falls through to standard fusion handling. This prevents misclassification.
**Regression check**: Integration test "falls through to standard fusion if no finance keys" validates this path.
**Lesson**: When adding adapter layers, always implement explicit shape detection with a clean fallback rather than guessing the payload type.

<<<<<<< HEAD
### [2026-03-01] — BE-P3 upstream non-200 fallback masking in `/api/ensemble`
**Reproduced**: branch recheck after P2 merge/rebase showed `/api/ensemble` consumed ML body without checking `inferResp.ok`.
**Root cause**: route validated schema only; HTTP status path was not represented in fallback metadata.
**Fix**: added explicit non-200 branch in `backend/src/index.js` with `ML_UPSTREAM_NON_200:<status>` fallback reason and surfaced `fallback_reason`, `upstream_status`, `upstream_error`.
**Regression check**: added `normalizeMlAssessmentForEnsemble` unit coverage in `backend/tests/mlContract.test.js` for upstream non-200 status and fallback reason propagation.
**Lesson**: endpoint-level fallback logic must encode transport failures distinctly from contract-shape failures.

### [2026-03-01] — BE-P3 escalate test asserted wrong event type
**Reproduced**: `npm test` failed in `policyEnforcement.e2e.test.js` on escalate path expecting `action_block`.
**Root cause**: stale assertion copied from block path.
**Fix**: changed assertion to require `action_escalate`.
**Regression check**: backend test suite passes after fix.
**Lesson**: transition-specific tests should assert exact event semantics, not shared generic expectations.
=======
### 2026-03-01 — Merge conflict in index.js between policyEnforcementService and fusion imports
**Reproduced**: During P3 file reads, discovered unresolved Git conflict markers (`<<<<<<< HEAD` / `=======` / `>>>>>>>`) in `index.js` import section. The HEAD branch had added `policyEnforcementService.js` while commit 6b9e9e8 had fusion imports.
**Root cause**: Feature branches diverged — BE-P2 (policy enforcement) and ARCH-CORE-DP1 (fusion) both modified the import section of `index.js`. The merge left conflict markers unresolved.
**Fix**: Resolved by keeping BOTH import sets — policyEnforcementService AND all fusion modules. Also re-added the missing `handleFusionEvaluate`, `handleLegacyViaFusion`, `/api/governance/fusion` POST route, and v2 compat routes which were lost during the merge.
**Regression check**: All 94 tests pass (14 unit evaluator + 14 unit observability + 66 integration).
**Lesson**: After merging feature branches, always run the full test suite and grep for conflict markers (`<<<<<<<`) before committing. Automate this check in CI.

### 2026-03-01 — v2 compat route migration.strategy mismatch
**Reproduced**: After restoring v2 compat routes, 3 integration tests failed — expected `migration.strategy: 'fusion-compat'` but got `'revamp'`.
**Root cause**: The restored `handleLegacyViaFusion` used the same migration block as the original `handlePolicyGate` (strategy: 'revamp') instead of the fusion-specific variant (strategy: 'fusion-compat' with fusionSource field).
**Fix**: Updated `handleLegacyViaFusion` to return `{ strategy: 'fusion-compat', fusionSource: fusionResult.source }`.
**Regression check**: All 94 tests pass.
**Lesson**: When restoring lost code after a merge conflict, always verify against the test expectations — don't assume the restored code matches the last known-good version.
>>>>>>> a55be3e (feat(arch-core): P3 observability guardrails — structured logging, metrics, health endpoint)
