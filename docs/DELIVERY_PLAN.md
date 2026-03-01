# Delivery Plan — ARCH-CORE v2: Fusion Evaluator

**Branch**: `lane/orchestrator/arch-core-v2`
**Commit**: `feat(arch-core): add fusion evaluator as governance decision source`
**Checkpoint cadence**: every 45 min

---

## Phase 1 — Core Build (this PR)

| # | Task | Status | Owner |
|---|------|--------|-------|
| 1 | Explore existing backend code & contracts | Done | Orchestrator |
| 2 | Create `backend/src/fusion/fusionEvaluator.js` | Done | Orchestrator |
| 3 | Create `backend/src/fusion/schema.js` (validation) | Done | Orchestrator |
| 4 | Create `backend/src/fusion/compatAdapter.js` | Done | Orchestrator |
| 5 | Wire `POST /api/governance/fusion` into `index.js` | Done | Orchestrator |
| 6 | Wire `/v2` compat routes | Done | Orchestrator |
| 7 | Verify legacy routes unchanged | Done | Orchestrator |
| 8 | Update `docs/POLICY_RULES.md` | Done | Orchestrator |
| 9 | Create `docs/INTEGRATION_CHECKLIST.md` | Done | Orchestrator |
| 10 | Create `docs/DELIVERY_PLAN.md` | Done | Orchestrator |
| 11 | curl proof — allow / review / block | Done | Orchestrator |
| 12 | Git branch + commit | Done | Orchestrator |

## Phase 2 — Hardening (DP1 — this packet)

| # | Task | Status |
|---|------|--------|
| 1 | Add unit tests for fusionEvaluator.js | Done |
| 2 | Add integration tests (supertest) for all routes | Done |
| 3 | Add `policy_version` + `model_version` fields | Done |
| 4 | Implement hard-policy-first guard | Done |
| 5 | Implement uncertainty guard (no auto-allow non-trivial risk) | Done |
| 6 | Add legacy finance payload adapter | Done |
| 7 | Update all documentation (4 files) | Done |
| 8 | Curl proofs for new logic paths | Done |

## Phase 3 — Observability Guardrails (P3 — this packet)

| # | Task | Status |
|---|------|--------|
| 1 | Create `fusionLogger.js` — structured NDJSON decision logging | Done |
| 2 | Create `fusionMetrics.js` — in-memory counters | Done |
| 3 | Wire logging + metrics into all fusion route handlers | Done |
| 4 | Add `GET /api/governance/fusion/health` endpoint | Done |
| 5 | Add `_requestId` to fusion responses for correlation | Done |
| 6 | Resolve index.js merge conflict (policyEnforcementService + fusion) | Done |
| 7 | Add 12 P3 integration tests + 14 P3 unit tests | Done |
| 8 | Update docs (checklist, delivery plan, mistakes log) | Done |

## Phase 4 — Production

| # | Task | Status |
|---|------|--------|
| 1 | Load testing / latency benchmarks | Planned |
| 2 | Alerting on stale_state frequency | Planned |
| 3 | Audit log persistence (Postgres) | Planned |
| 4 | RBAC on fusion endpoint | Planned |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| ML service unavailable | Medium | Low | Fusion degrades to policy-only; `source: "policy-only"` |
| Stale ML data | Medium | Medium | `stale_state: true` + increased policy weight |
| Schema drift between policy & fusion | Low | High | Schema validation in `schema.js`; assertion utility |
| Legacy consumers break | Very Low | High | Original routes untouched; `/v2` is additive |

## ETA

- **PR ready**: now (Phase 1 complete)
- **Hardening**: +1 sprint
- **Production**: +2 sprints
