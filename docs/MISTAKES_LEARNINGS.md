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
**Reproduced**: branch recheck showed ML body consumption without `inferResp.ok` handling.
**Root cause**: schema validation existed but transport failure metadata was not surfaced.
**Fix**: added explicit non-200 fallback branch and propagated fallback reason/status details.
**Regression check**: contract normalization tests cover non-200 propagation.
**Lesson**: endpoint fallback logic must distinguish transport failures from schema failures.

### 2026-03-01 - BE-P3 escalate test asserted wrong event type
**Reproduced**: `policyEnforcement.e2e.test.js` expected `action_block` on escalate path.
**Root cause**: stale assertion copied from block-path test.
**Fix**: updated assertion to `action_escalate`.
**Regression check**: backend test suite passed after correction.
**Lesson**: transition-specific tests should assert exact event semantics.
