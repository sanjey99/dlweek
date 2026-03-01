# TESTBENCH-BE-C1: Backend Lifecycle and Integrity Validation

## Prerequisites
- Backend running at `http://localhost:4000`
- ML service reachable by backend (or known fallback behavior)
- `node` available in shell (used to extract `actionId` from JSON)
- Optional for realtime stream check: `wscat` or equivalent WebSocket client

Use this payload for review-path lifecycle tests (`pending_review` expected):

```bash
REVIEW_PAYLOAD='{
  "action":{"type":"merge-main"},
  "context":{
    "testsPassing":true,
    "touchesCriticalPaths":true,
    "rollbackPlanPresent":true
  },
  "ml_assessment":{
    "risk_score":0.58,
    "confidence":0.82,
    "label":"warning",
    "timestamp":"2026-03-01T12:00:00.000Z"
  }
}'
```

## Step-by-step commands

### 1) Propose -> Approve

```bash
APPROVE_ACTION_ID=$(curl -s -X POST http://localhost:4000/api/governance/actions/propose \
  -H 'Content-Type: application/json' \
  -d "$REVIEW_PAYLOAD" | node -e "process.stdin.on('data',d=>process.stdout.write(JSON.parse(d).actionId))")

echo "APPROVE_ACTION_ID=$APPROVE_ACTION_ID"

curl -s -X POST http://localhost:4000/api/action/approve \
  -H 'Content-Type: application/json' \
  -d "{\"actionId\":\"$APPROVE_ACTION_ID\",\"actor\":\"qa-lead\",\"notes\":\"manual approve\"}"
```

### 2) Propose -> Block

```bash
BLOCK_ACTION_ID=$(curl -s -X POST http://localhost:4000/api/governance/actions/propose \
  -H 'Content-Type: application/json' \
  -d "$REVIEW_PAYLOAD" | node -e "process.stdin.on('data',d=>process.stdout.write(JSON.parse(d).actionId))")

echo "BLOCK_ACTION_ID=$BLOCK_ACTION_ID"

curl -s -X POST http://localhost:4000/api/action/block \
  -H 'Content-Type: application/json' \
  -d "{\"actionId\":\"$BLOCK_ACTION_ID\",\"actor\":\"security-reviewer\",\"notes\":\"manual block\"}"
```

### 3) Propose -> Escalate

```bash
ESCALATE_ACTION_ID=$(curl -s -X POST http://localhost:4000/api/governance/actions/propose \
  -H 'Content-Type: application/json' \
  -d "$REVIEW_PAYLOAD" | node -e "process.stdin.on('data',d=>process.stdout.write(JSON.parse(d).actionId))")

echo "ESCALATE_ACTION_ID=$ESCALATE_ACTION_ID"

curl -s -X POST http://localhost:4000/api/action/escalate \
  -H 'Content-Type: application/json' \
  -d "{\"actionId\":\"$ESCALATE_ACTION_ID\",\"actor\":\"governance-lead\",\"notes\":\"needs extra review\"}"
```

### 4) Audit timeline and final-state detail checks

```bash
curl -s http://localhost:4000/api/governance/actions/$APPROVE_ACTION_ID
curl -s http://localhost:4000/api/governance/actions/$BLOCK_ACTION_ID
curl -s http://localhost:4000/api/governance/actions/$ESCALATE_ACTION_ID
```

### 5) Realtime/backend integrity checks

Optional realtime stream command (if `wscat` installed):

```bash
wscat -c ws://localhost:4000/ws/signals
```

## Expected outputs/checkpoints

### Propose response (all three propose calls)
Expect:
- `ok=true`
- `packetId="BE-P3"`
- non-empty `actionId`
- `status="pending_review"`
- top-level decision contract fields present: `decision`, `reasonTags`, `confidence`
- ML contract fields present: `ml_contract.strict_valid`, `ml_contract.used_fallback`, `ml_contract.validation_error`
- realtime fields present: `realtime.source`, `realtime.timestamp`, `realtime.stale_state`

### Final status per lifecycle action
- Approve path final response: `status="approved_by_human"`, `decision="allow"`, `reasonTags` includes `HUMAN_APPROVED`
- Block path final response: `status="blocked_by_human"`, `decision="block"`, `reasonTags` includes `HUMAN_BLOCKED`
- Escalate path final response: `status="escalated"`, `decision="review"`, `reasonTags` includes `ESCALATED_FOR_REVIEW`

### Audit timeline verification
From `GET /api/governance/actions/:actionId`, verify:
- `action.status` equals expected final state for that path
- `events` array exists and is ordered
- first event is `policy_evaluated`
- action-specific event exists:
  - approve path: `action_approve`
  - block path: `action_block`
  - escalate path: `action_escalate`
- event ordering integrity: sequence increases (`seq`) and hash chain linkage is consistent (`prevHash` of current equals `hash` of previous)

### Realtime/backend integrity verification
From propose response and WS ticks:
- `source` is present and truthful (for fallback path, source should indicate fallback context)
- `timestamp` is present and ISO-like
- `stale_state` is present (`true`/`false`)
- if available in WS tick payload, verify:
  - `stale_reason` present when `stale_state=true`
  - `age_ms` is numeric and non-negative

## Troubleshooting notes
- If propose returns `status` not `pending_review`, adjust payload risk profile and retry.
- If action endpoints return `409`, action likely already in terminal state or invalid transition was attempted.
- If `ml_contract.used_fallback=true`, inspect `ml_contract.validation_error` and validate upstream ML payload contract fields.
- If WS checks fail, confirm backend is running and `ws://localhost:4000/ws/signals` is reachable.
