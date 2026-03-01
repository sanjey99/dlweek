# AUTOPILOT_RULES.md

## Purpose
Defines safe autonomous collaboration loop between Jarvis (planner) and Copilot worker (implementer).

## Loop protocol
1. Copilot reads `JARVIS_INBOX.md`.
2. Copilot executes highest-priority TODO packet.
3. Copilot updates `COPILOT_OUTBOX.md` with result.
4. Copilot commits changes to working branch.
5. Jarvis reviews outbox and rewrites inbox with next packet.

## Branch policy
- Use: `autopilot/night-20260228`
- No direct force push to `main`
- PR to `main` only after acceptance checks pass

## Allowed actions
- Code edits in: `backend/`, `frontend/`, `ml_service/`, `docs/`, `data/`
- Run local build/tests/lint relevant to changed files
- Add docs for setup and troubleshooting

## Disallowed actions
- Edit secrets/tokens/auth configs
- Delete repositories or rewrite history on main
- Modify external account settings
- Execute financial transactions

## Stop conditions
- If task conflicts with rules
- If required context is missing
- If command errors persist after 3 retries

When stop condition occurs:
- Write details to `COPILOT_OUTBOX.md`
- Mark packet BLOCKED
- Wait for Jarvis update
