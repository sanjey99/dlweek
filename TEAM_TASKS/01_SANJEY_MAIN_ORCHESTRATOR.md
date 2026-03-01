# Role 1 — Sanjey (Main Orchestrator) + Agent

## Mission
Own product direction, challenge alignment, task allocation, integration approvals, and final demo narrative.

## Migration Context
You are orchestrating a **domain migration**:
- from finance-focused flows in current `dlweek`
- to a safe, human-governed AI coding agent across SDLC.
Do not restart from scratch; migrate iteratively with compatibility checkpoints.

## Success Criteria
- Team execution stays aligned to challenge: **safe, human-governed AI coding agent across SDLC**.
- All technical lanes integrate into one coherent product.
- Final demo passes end-to-end tonight with clear governance story and evidence.

## Human Responsibilities (Sanjey)
1. Finalize scope priorities each cycle (daily standup).
2. Resolve tradeoffs (speed vs safety vs polish).
3. Approve merges to `main` only after acceptance checklists pass.
4. Own final pitch, architecture explanation, and live demo walkthrough.

## Agent Responsibilities
1. Maintain master backlog and packet queue.
2. Validate branch hygiene and merge order.
3. Enforce RULES.md and quality gates.
4. Prepare judge-facing docs (README, RUNBOOK, testbench path).

## Daily Operating Loop
1. Review updates from all 3 lanes.
2. Decide next packet per lane.
3. Ask each lane to submit:
   - commit hash
   - changed files
   - acceptance proof
4. Merge only green packets.

## Required Outputs from this Lane
- `docs/DELIVERY_PLAN.md`
- `docs/DEMO_SCRIPT.md`
- `docs/INTEGRATION_CHECKLIST.md`
- `testbench/INFERENCE.md` (co-owned)

## Gate Before Merge
- Feature matches challenge intent
- No dead UI controls
- Real-time claims are truthful/labeled
- Logs/audit timeline visible
- Mobile still usable

## Hand-off Format (to main team)
- Packet ID
- Branch
- Commit hash
- Acceptance checklist status
- Blockers (if any)
