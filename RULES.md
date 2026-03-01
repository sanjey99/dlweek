# RULES.md — DL Week Hackathon Guardrails

This file is the source of truth for how we execute this hackathon project.

## 0) Repository Scope (Hard Rule)
- We work **only** in: `projects/dlweek/`
- `projects/hackathon_fin_ai/` is frozen reference and must not be modified for this hackathon work.
- Any new implementation, docs, tests, and commits go to `dlweek` only.

## 0.1) Delivery Deadline (Hard Rule)
- Final solution must be delivery-ready **tonight**.
- No long-runway plans unless they directly improve tonight’s submission quality.
- Prefer shippable depth over unfinished breadth.

## 1) Track Alignment (Must-Have)
Build for: **safe, human-governed AI coding agents across the SDLC**.

Our solution must clearly show:
1. Real ML/DL components (not prompt-only logic)
2. Human oversight / intervention controls
3. Governance + auditability
4. Production-minded UX

## 2) Demo Principle
- No misleading fake-live widgets.
- If data is simulated, label it clearly.
- If feature is fallback/demo mode, label it explicitly.
- Prioritize truthfulness and reliability over flashy but inaccurate behavior.

## 3) Submission Constraints
- Final submission repository must be public and complete.
- Assume no post-submission edits.
- Include clear run instructions and verification steps.
- Keep citations for external APIs/models/datasets used.

## 4) Required Deliverables in Repo
- `README.md` (standard setup + architecture + deployment)
- `docs/RUNBOOK.md` (smoke tests and operational steps)
- `testbench/INFERENCE.md` (grader-facing inference/testing instructions)
- Sample payloads and expected output examples
- Clear demo script/checklist

## 5) Product Requirements (Current)
### A) Governance Loop
- Agent proposes action
- Risk engine scores action
- Policy gate decides: auto-approve / require review / block
- Human can approve/block/escalate
- Decision and outcome are logged in audit timeline

### B) Real-Time Expectations
Use WebSocket/SSE where possible; polling only as fallback.
Every live panel should expose:
- source
- last update time
- stale-state indicator

### C) Explainability
Complex metrics must have concise info tooltips and interpretation.

### D) Mobile Usability
No horizontal overflow on phone widths.
Critical workflows must remain usable on mobile.

## 6) Engineering Rules
- No secrets in repo.
- No force-push to protected/main branch.
- Keep commits packeted and descriptive.
- Add acceptance checks per packet.
- No rogue behavior: no unassigned tasks, no major scope pivots, no architecture rewrites without orchestrator approval.
- No silent contract changes (API/event schema changes require explicit sync note in PR).

## 7) Quality Gate Before “Ready to Deploy”
All must pass:
- Frontend build passes
- Backend + ML health endpoints pass
- Core flows run end-to-end
- No dead clickable controls
- Mobile checks pass
- Docs updated and reproducible

## 8) Communication Rule
When proposing changes, always state:
- what problem it solves
- what files change
- acceptance criteria
- rollback/safe fallback
