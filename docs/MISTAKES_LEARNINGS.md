## 2026-03-01 ML-DP1

- Issue: Python indentation errors after paste/format collapse in app.py.
- Fix: Replaced flattened blocks, standardized 4-space indentation, recompiled with py_compile.
- Prevention: Avoid one-line paste dumps; validate syntax immediately after major paste.

- Issue: Contract key mismatch (fallback/reason vs fallback_used/reason_tags).
- Fix: Unified all endpoints to frozen schema keys.
- Prevention: Keep a contract checklist and verify all response paths before commit.
