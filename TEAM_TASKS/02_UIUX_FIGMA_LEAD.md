# Role 2 — UI/UX + Figma Lead + Agent

## Mission
Design and implement the governance console UX that looks enterprise-ready and is fully interactive on desktop + mobile.

## Migration Context
Revamp existing finance UI surfaces into challenge-aligned governance UI.
- Prefer component reuse + relabel + behavior rewiring over full rebuild.
- Remove finance-only wording/widgets as corresponding governance widgets replace them.

## Scope
- Figma design system + component states
- Frontend implementation quality
- Explainability UX
- Mobile responsiveness and accessibility

## Human Responsibilities
1. Own design decisions and consistency.
2. Keep Figma and implemented UI in sync.
3. Define all component states (idle/loading/error/success/stale/disconnected).

## Agent Responsibilities
1. Convert Figma states into reusable components.
2. Remove dead controls or mark clearly disabled.
3. Add tooltip/ⓘ explainability content for complex metrics.
4. Ensure mobile layouts (320–430px) are fully usable.

## Priority Work Packets
### UX-P1: Governance Console Baseline
- Work queue, risk gate panel, explainability drawer, audit timeline shell.

### UX-P2: Interactivity Integrity
- Top-right account/notifications functional (or explicit Coming Soon)
- Left controls wired
- No deceptive clickable elements

### UX-P3: Mobile-First Hardening
- Remove horizontal overflow
- Stack dense layouts
- Tap-safe controls

### UX-P4: Explainability Layer
- Tooltips with plain-English + interpretation
- “Why this recommendation?” expandable section

## Required Outputs
- `design/` exports (updated)
- `frontend/src/...` components
- `docs/UI_STATES.md`
- screenshot set for desktop+mobile

## Acceptance Checklist
- [ ] No dead controls
- [ ] Mobile pass on 390x844, 375x812, 430x932
- [ ] All live widgets show source + timestamp + stale status
- [ ] Info tooltips populated

## Hand-off Format
- Packet ID (UX-Px)
- Commit hash
- Before/after screenshots
- Acceptance checklist
