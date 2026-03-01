# Mistakes & Learnings - Self-Repair Log

> Append-only log. Follow the loop: reproduce -> root cause -> smallest safe fix -> regression check -> document.

---

## Template

```
### [DATE] - TITLE
**Reproduced**: how the issue was found
**Root cause**: why it happened
**Fix**: what was changed (smallest safe fix)
**Regression check**: how we verified the fix
**Lesson**: what to do differently next time
```

---

### 2026-03-01 - ML-DP1 contract freeze corrections
**Reproduced**: Python indentation and contract key mismatch were found during ML service hardening.
**Root cause**: paste/format collapse in `app.py` and mixed schema naming (`fallback/reason` vs `fallback_used/reason_tags`).
**Fix**: restored standard 4-space indentation, recompiled with `py_compile`, and unified all inference responses to frozen keys.
**Regression check**: `python -m py_compile ml_service/app.py` and JSON validation for sample payloads pass.
**Lesson**: validate syntax immediately after large edits and run a contract checklist before commit.

### 2026-03-01 - Hard-policy block changed PAYLOAD_BLOCK expectation
**Reproduced**: Integration test for destructive delete path failed after hard-policy-first guard was introduced.
**Root cause**: test expected `FUSED_BLOCK_THRESHOLD`, but early hard-block path now emits `HARD_POLICY_BLOCK`.
**Fix**: updated test expectation to `HARD_POLICY_BLOCK`.
**Regression check**: backend suite passed when re-run in the upstream lane.
**Lesson**: when introducing early-return guards, verify existing tests still target the intended decision path.

### 2026-03-01 - Legacy finance adapter key collision risk
**Reproduced**: design review identified ambiguous payload handling when finance and fusion shapes coexist.
**Root cause**: shape detection could misclassify mixed payloads.
**Fix**: prioritize finance-specific keys (`transaction_type` or `amount`), otherwise fall through to standard fusion.
**Regression check**: integration path validates standard-fusion fallback when finance keys are absent.
**Lesson**: adapter layers need explicit shape detection and deterministic fallback behavior.

### 2026-03-01 - BE-P3 upstream non-200 fallback masking in /api/ensemble
**Reproduced**: branch recheck after merge/rebase showed `/api/ensemble` consumed ML body without checking `inferResp.ok`.
**Root cause**: route validated schema only; HTTP status path was not represented in fallback metadata.
**Fix**: added explicit non-200 handling with fallback reason propagation and surfaced upstream status/error metadata.
**Regression check**: added normalization unit coverage for non-200 status and fallback reason propagation.
**Lesson**: endpoint-level fallback logic must encode transport failures distinctly from contract-shape failures.

### 2026-03-01 - BE-P3 escalate test asserted wrong event type
**Reproduced**: `policyEnforcement.e2e.test.js` expected `action_block` on escalate path.
**Root cause**: stale assertion copied from block-path test.
**Fix**: updated assertion to `action_escalate`.
**Regression check**: backend test suite passed after correction.
**Lesson**: transition-specific tests should assert exact event semantics.

### 2026-03-01 - Merge conflict in index.js between policyEnforcementService and fusion imports
**Reproduced**: conflict markers were found in `index.js` import section during branch integration.
**Root cause**: BE-P2 (policy enforcement) and ARCH-CORE-DP1 (fusion) both modified the same import block.
**Fix**: preserved both import sets and restored fusion-compatible routes/handlers.
**Regression check**: full suite passed after conflict resolution in that lane.
**Lesson**: run conflict-marker scans and full tests immediately after merges.

### 2026-03-01 - v2 compat route migration.strategy mismatch
**Reproduced**: integration tests expected `migration.strategy: 'fusion-compat'` but received `'revamp'`.
**Root cause**: restored compat path reused non-compat migration metadata.
**Fix**: updated compat response to emit `strategy: 'fusion-compat'` with fusion source details.
**Regression check**: integration suite passed after update.
**Lesson**: restored code after conflicts must be validated against current test expectations.
=======
### [2026-03-01] — BE-P3 escalate test asserted wrong event type
**Reproduced**: `npm test` failed in `policyEnforcement.e2e.test.js` on escalate path expecting `action_block`.
**Root cause**: stale assertion copied from block path.
**Fix**: changed assertion to require `action_escalate`.
**Regression check**: backend test suite passes after fix.
**Lesson**: transition-specific tests should assert exact event semantics, not shared generic expectations.

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

