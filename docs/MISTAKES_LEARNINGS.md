# Mistakes & Learnings — Self-Repair Log

> Append-only log.  Follow the loop: reproduce → root cause → smallest safe fix → regression check → document.

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

_No entries yet. This file will be appended as issues are discovered._

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
