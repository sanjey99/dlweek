# Autopilot Setup (Jarvis x Copilot)

## Goal
Minimize manual copy/paste while keeping safe control over edits.

## Files used
- `JARVIS_INBOX.md` -> task packets from Jarvis
- `COPILOT_OUTBOX.md` -> worker progress updates
- `AUTOPILOT_RULES.md` -> guardrails
- `scripts/run_autopilot.ps1` -> local helper loop

## Laptop setup (Windows + VS Code)
1. Clone repo and create branch:
```bash
git clone https://github.com/sanjey99/hackathon-fin-ai.git
cd hackathon-fin-ai
git checkout -b autopilot/night-20260228
git push -u origin autopilot/night-20260228
```

2. Start helper script:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_autopilot.ps1 -Branch autopilot/night-20260228 -Cycles 8
```

3. Each cycle:
- Copilot executes top TODO packet from `JARVIS_INBOX.md`
- Press Enter in terminal
- script commits + pushes

## Recommended Copilot prompt
"Read AUTOPILOT_RULES.md and JARVIS_INBOX.md. Execute the highest-priority TODO packet only. Update COPILOT_OUTBOX.md with completed work/files/checks/blockers, then stop."

## Notes
- This is semi-automated unless your Copilot/agent supports fully non-interactive execution.
- No force-push to `main`.
- Work only inside allowed paths.
