# Demo Script (Release Gate v2)

## Demo Objective
Show end-to-end behavior across ML, Backend, UI including failure + recovery.

## Preconditions
- Correct branch/build deployed
- Test data set prepared
- Evidence capture on (screenshots/log recording)

## Runbook

### Phase A — Normal Flow
1. Start with clean state.
2. Trigger happy-path input.
3. Verify:
- ML output valid
- Backend decision persisted
- UI reflects same state
4. Capture evidence (`evidence/demo/a-normal/`).

### Phase B — Governance / Review Flow
1. Trigger threshold-boundary input.
2. Verify review gate shown (not direct allow/block finalize).
3. Capture evidence (`evidence/demo/b-review/`).

### Phase C — Failure Injection
1. Inject backend timeout or dependency failure.
2. Verify:
- clear user-visible error
- no phantom success state
3. Capture evidence (`evidence/demo/c-failure/`).

### Phase D — Recovery
1. Perform retry/fallback action.
2. Verify state consistency restored across all lanes.
3. Capture evidence (`evidence/demo/d-recovery/`).

## Operator Cues
- If timeout occurs > X sec, announce “switching to retry path”.
- If stale state appears, show stale guardrail behavior intentionally.

## Fallback Plan (Live Demo)
1. Switch to known-good static dataset.
2. Re-run from Phase A checkpoint.
3. If backend unstable, use read-only UI walkthrough with captured evidence.

## Success Criteria
- At least 1 injected failure + successful recovery demonstrated.
- No cross-lane state contradiction in final state.
