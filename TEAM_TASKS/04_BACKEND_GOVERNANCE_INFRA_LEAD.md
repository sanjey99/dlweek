# Role 4 — Backend/Governance/Infra Lead + Agent

## Mission
Build the governed runtime and policy enforcement pipeline around agent actions, with real-time eventing and complete auditability.

## Scope
- Policy engine and gates
- Action lifecycle (approve/block/escalate)
- Real-time streams (WebSocket/SSE + fallback)
- Audit logging and testbench integration

## Human Responsibilities
1. Define policy rules for each SDLC action type.
2. Approve security boundaries and environment permissions.
3. Validate incident scenarios and governance workflows.

## Agent Responsibilities
1. Implement policy evaluation endpoints.
2. Wire real-time event feed for alerts/activity/status.
3. Persist action history and acknowledgements.
4. Provide smoke tests and reproducible run steps.

## Priority Work Packets
### BE-P1: Policy Gate Engine
- Input: proposed action + context
- Output: allow/review/block + reason tags

### BE-P2: Action Lifecycle API
- `POST /action/approve`
- `POST /action/block`
- `POST /action/escalate`
- Update timeline and case state

### BE-P3: Real-Time Feed Integrity
- WebSocket/SSE event stream for alerts, recent activity, market/telemetry if applicable
- stale-state handling and connection visibility

### BE-P4: Audit + Testbench
- Immutable-style action/event log
- grader-friendly scenario scripts and expected outcomes

## Required Outputs
- `backend/src/index.js` and supporting modules
- `docs/RUNBOOK.md` updates
- `testbench/INFERENCE.md` (co-owned)
- `docs/POLICY_RULES.md`

## Acceptance Checklist
- [ ] Governance actions produce real state transitions
- [ ] Real-time feed is truthful (no static fake-live)
- [ ] Full audit timeline queryable
- [ ] Smoke tests pass end-to-end

## Hand-off Format
- Packet ID (BE-Px)
- Commit hash
- endpoint proof (curl/logs)
- acceptance checklist
