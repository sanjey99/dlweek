# Team Execution Protocol (4 People + Agents)

Use this with all lanes to keep delivery synchronized.

## Migration Mode (Important)
This project is a **revamp** of the existing `dlweek` codebase (originally finance-oriented), not a greenfield rebuild.
- Reuse architecture/components where possible.
- Migrate domain language and workflows toward the new challenge track.
- Avoid destructive rewrites unless explicitly approved by orchestrator.

## Branching
- Main integration branch: `main`
- Each lane works on feature branch:
  - `lane/uiux/*`
  - `lane/ml/*`
  - `lane/backend/*`
  - `lane/orchestrator/*`

## Packet Rules
Each lane executes packet-by-packet.
No packet is considered done without:
1. commit hash
2. acceptance checklist
3. short proof (screenshot/log/curl)

## Anti-Rogue Rules (Mandatory)
- Work only on assigned packet and owned files.
- Do not start speculative features.
- Do not alter another lane’s contract without orchestrator approval.
- If blocked, stop and escalate quickly; do not improvise unsafe shortcuts.
- If a task conflicts with RULES.md or deadline, follow RULES.md and escalate.

## Merge Rules
- Merge order each cycle:
  1) ML + Backend contracts
  2) UI integration
  3) orchestrator docs/testbench
- If conflicts occur, orchestrator decides final contract source-of-truth.

## Standup Template (use every sync)
- Yesterday done:
- Current packet:
- Blockers:
- Help needed:
- ETA to PR:
- Risk to tonight deadline:

## Definition of Ready for New Packet
- Scope clear
- Files clear
- Acceptance clear
- Dependencies identified

## Definition of Done
- Acceptance checklist 100%
- No regressions in core flow
- Docs updated
- Hand-off posted to orchestrator
- Pull Request opened from lane branch to `main`

## Mandatory PR Handoff (each packet)
When a packet is complete, lane owner/agent must:
1. Push branch
2. Open PR to `main`
3. Include in PR description:
   - Packet ID
   - Scope summary
   - Changed files
   - Acceptance checklist
   - Evidence (screenshots/logs/curl)
4. Notify orchestrator with PR link
