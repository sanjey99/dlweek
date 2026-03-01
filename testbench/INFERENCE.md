# TESTBENCH-BE-C1: Backend Lifecycle and Integrity Validation

## Prerequisites
- Backend running at `http://localhost:4000`
- ML service reachable by backend (or known fallback behavior)
- `node` available in shell (used to parse JSON)
- Optional for realtime stream check: `wscat` or equivalent WebSocket client

Health pre-check (must pass before lifecycle tests):

```bash
curl -s http://localhost:4000/health
```

Expected healthy response checkpoint:
- `ok=true`
- `service="backend"`

Review-path payload (`pending_review` expected on propose):

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
PROPOSE_APPROVE_RAW=$(curl -s -X POST http://localhost:4000/api/governance/actions/propose \
  -H 'Content-Type: application/json' \
  -d "$REVIEW_PAYLOAD")

APPROVE_ACTION_ID=$(printf '%s' "$PROPOSE_APPROVE_RAW" | node -e "process.stdin.on('data',d=>{const o=JSON.parse(d);process.stdout.write(o.actionId||'')})")

echo "APPROVE_ACTION_ID=$APPROVE_ACTION_ID"

curl -s -X POST http://localhost:4000/api/action/approve \
  -H 'Content-Type: application/json' \
  -d "{\"actionId\":\"$APPROVE_ACTION_ID\",\"actor\":\"qa-lead\",\"notes\":\"manual approve\"}"
```

### 2) Propose -> Block

```bash
PROPOSE_BLOCK_RAW=$(curl -s -X POST http://localhost:4000/api/governance/actions/propose \
  -H 'Content-Type: application/json' \
  -d "$REVIEW_PAYLOAD")

BLOCK_ACTION_ID=$(printf '%s' "$PROPOSE_BLOCK_RAW" | node -e "process.stdin.on('data',d=>{const o=JSON.parse(d);process.stdout.write(o.actionId||'')})")

echo "BLOCK_ACTION_ID=$BLOCK_ACTION_ID"

curl -s -X POST http://localhost:4000/api/action/block \
  -H 'Content-Type: application/json' \
  -d "{\"actionId\":\"$BLOCK_ACTION_ID\",\"actor\":\"security-reviewer\",\"notes\":\"manual block\"}"
```

### 3) Propose -> Escalate

```bash
PROPOSE_ESCALATE_RAW=$(curl -s -X POST http://localhost:4000/api/governance/actions/propose \
  -H 'Content-Type: application/json' \
  -d "$REVIEW_PAYLOAD")

ESCALATE_ACTION_ID=$(printf '%s' "$PROPOSE_ESCALATE_RAW" | node -e "process.stdin.on('data',d=>{const o=JSON.parse(d);process.stdout.write(o.actionId||'')})")

echo "ESCALATE_ACTION_ID=$ESCALATE_ACTION_ID"

curl -s -X POST http://localhost:4000/api/action/escalate \
  -H 'Content-Type: application/json' \
  -d "{\"actionId\":\"$ESCALATE_ACTION_ID\",\"actor\":\"governance-lead\",\"notes\":\"needs extra review\"}"
```

### 4) Negative-transition integrity check (double-resolution protection)

Attempt second resolution on the already approved action:

```bash
curl -i -s -X POST http://localhost:4000/api/action/block \
  -H 'Content-Type: application/json' \
  -d "{\"actionId\":\"$APPROVE_ACTION_ID\",\"actor\":\"security-reviewer\",\"notes\":\"second resolution attempt\"}"
```

### 5) Audit timeline and final-state detail checks

```bash
curl -s http://localhost:4000/api/governance/actions/$APPROVE_ACTION_ID
curl -s http://localhost:4000/api/governance/actions/$BLOCK_ACTION_ID
curl -s http://localhost:4000/api/governance/actions/$ESCALATE_ACTION_ID
```

### 6) Realtime/backend integrity checks

Optional realtime stream command:

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
- decision contract fields present: `decision`, `reasonTags`, `confidence`
- ML contract fields present: `ml_contract.strict_valid`, `ml_contract.used_fallback`, `ml_contract.validation_error`
- realtime fields present: `realtime.source`, `realtime.timestamp`, `realtime.stale_state`

### Final status per lifecycle action
- Approve path: `status="approved_by_human"`, `decision="allow"`, `reasonTags` includes `HUMAN_APPROVED`
- Block path: `status="blocked_by_human"`, `decision="block"`, `reasonTags` includes `HUMAN_BLOCKED`
- Escalate path: `status="escalated"`, `decision="review"`, `reasonTags` includes `ESCALATED_FOR_REVIEW`

### Negative-transition check
From the second-resolution attempt (approve then block same `actionId`):
- HTTP status is `409`
- error message contains `invalid transition`

### Audit timeline verification
From `GET /api/governance/actions/:actionId`, verify:
- `action.status` equals expected final state
- `events` array exists and ordered
- first event is `policy_evaluated`
- action event exists by path:
  - approve: `action_approve`
  - block: `action_block`
  - escalate: `action_escalate`
- integrity ordering: `seq` increases; each event links hash chain (`prevHash` == previous `hash`)

### Realtime/backend integrity verification
From propose response and WS ticks:
- `realtime.source` expectations:
  - `ml_service` when strict ML contract is valid
  - `fallback` when fallback path is used (`ml_contract.used_fallback=true`)
- `timestamp` present and ISO-like
- `stale_state` present (`true`/`false`)
- if present on WS tick payload:
  - `stale_reason` present when `stale_state=true`
  - `age_ms` numeric and non-negative

## Troubleshooting notes
- If `actionId` extraction fails or is empty, print raw propose response and verify it contains `ok=true` and non-empty `actionId` before proceeding:

```bash
echo "$PROPOSE_APPROVE_RAW"
echo "$PROPOSE_BLOCK_RAW"
echo "$PROPOSE_ESCALATE_RAW"
```

- If propose status is not `pending_review`, adjust payload risk profile and retry.
- If transition call returns `409` unexpectedly, confirm action is not already terminal and actionId is correct.
- If `ml_contract.used_fallback=true`, inspect `ml_contract.validation_error` and upstream ML payload contract fields.
- If WS checks fail, confirm backend is running and `ws://localhost:4000/ws/signals` is reachable.
