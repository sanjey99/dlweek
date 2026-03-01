# INFERENCE Contract Validation (ML-DP1)

Required keys:
- risk_category
- risk_score
- uncertainty
- recommendation
- reason_tags
- model_version
- fallback_used

Checks:
1) Keys present for success + fallback
2) risk_score, uncertainty in [0,1]
3) recommendation in {allow, review, block}
4) reason_tags is string[]
5) model unavailable -> deterministic fallback_used=true
6) high uncertainty path avoids auto-allow for medium/high risk
7) adverse high-risk sample returns block/review per thresholds

---

# TESTBENCH-UI-B1 — UI State Verification Checklist

> Reproducible manual QA steps for the Sentinel governance dashboard.
> All checks are objective pass/fail and screenshot-friendly.
> Aligns with `docs/UI_STATES.md` and RULES.md §5 (live panels), §5D (mobile), §7 (dead controls).

## Prerequisites

```bash
cd frontend && npm install && npm run dev
# Default: http://localhost:5173 (Vite)
```

- Open browser DevTools → disable cache.
- Tests assume dark theme on first load (`isDark: true` default in `App.tsx`).
- All viewports: use DevTools device emulation with "Responsive" mode.

---

## 1  UI State Verification

### 1.1 Default Load State

| #  | Step | Expected Result | Pass / Fail |
|----|------|-----------------|:-----------:|
| 1  | Navigate to `http://localhost:5173` | Page loads with no blank screen; zero `console.error` entries | ☐ |
| 2  | Inspect TopNav | ShieldCheck icon (green) + "Sentinel" text rendered; sticky at top (`position: sticky; top: 0`) | ☐ |
| 3  | Inspect status indicator | Green pulsing dot with `ping` animation visible left of (desktop) or adjacent to (mobile) "System Operational" | ☐ |
| 4  | Inspect breadcrumb | Shows `Dashboard / AI Safety Monitor` above heading | ☐ |
| 5  | Inspect page heading | `Security Operations Center` in 20 px bold text (desktop) | ☐ |
| 6  | Inspect subtitle (desktop only) | `Real-time monitoring and human review of all autonomous AI agent activity.` visible; hidden on mobile | ☐ |
| 7  | Inspect MetricsRow | 4 metric cards: **Total AI Actions Today** (1,245), **Pending Reviews** (4), **High-Risk Interventions** (12), **Global Approval Rate** (94 %) | ☐ |
| 8  | Inspect ActionFeed | 12 action rows visible (scrollable) with timestamp, agent name, environment badge, risk-status badge | ☐ |
| 9  | Inspect ReviewPanel default | Pre-selected `act-001` (`DROP TABLE users_backup;` by `agent-db-ops`, PROD, riskScore 94) | ☐ |

### 1.2 Review Panel Content Integrity (action `act-001`)

| #  | Element | Expected | Pass / Fail |
|----|---------|----------|:-----------:|
| 1  | Header badge | Red "HUMAN-IN-THE-LOOP" badge (`NEEDS REVIEW` / risk label) | ☐ |
| 2  | Agent info | Agent: `agent-db-ops` · Env badge: `PROD` · Timestamp: `14:32:01` | ☐ |
| 3  | Proposed Command block | Monospace `DROP TABLE users_backup;` with red left border (riskScore ≥ 80 → `COLORS.red` = `#E5484D`) | ☐ |
| 4  | Risk Score gauge | Visual gauge showing `94` colored `#E5484D` (red) | ☐ |
| 5  | Flag reasons | 3 bullets: (a) "Destructive SQL operation detected (DROP TABLE)" (b) "Target environment is Production — irreversible action" (c) "No backup verification record found for users_backup" | ☐ |
| 6  | Action buttons | "Approve" (green outline, CheckCircle icon) + "Block Action" (red solid, ShieldX icon) — both **enabled** | ☐ |

### 1.3 Action State Transitions

| #  | Step | Expected Result | Pass / Fail |
|----|------|-----------------|:-----------:|
| 1  | Click **Approve** on `act-001` | Toast: "Action approved successfully" / "Agent action has been permitted to proceed." · `act-001` status → `APPROVED` · Panel auto-advances to next pending action (`act-003` or `act-007`) | ☐ |
| 2  | Click **Block Action** on next pending | Toast: "Action blocked" / "Agent action has been permanently blocked." · Status → `HIGH_RISK_BLOCKED` · Panel advances to next pending | ☐ |
| 3  | Select a resolved (non-pending) action in feed | Feed row `cursor: default` for non-pending; clicking does **not** change `selectedAction` (guard: `isPending && onSelectAction(action)` in `ActionFeed`) | ☐ |
| 4  | Resolve all 4 pending actions (`act-001`, `act-003`, `act-007`, `act-008`, `act-012`) | ReviewPanel shows null/empty state: Info icon + "No action selected" + "Click a pending review in the feed" | ☐ |
| 5  | View resolved action while selected | Approve/Block buttons show `disabled` + `opacity: 0.4` + `cursor: not-allowed`; additional "This action has already been resolved" banner appears | ☐ |

### 1.4 Theme Toggle

| #  | Step | Expected Result | Pass / Fail |
|----|------|-----------------|:-----------:|
| 1  | Click Sun icon in TopNav (dark → light) | Background changes `#0A0A0A` → `#F5F5F5`; surface `#171717` → `#FFFFFF`; icon switches to Moon | ☐ |
| 2  | Verify all surfaces update | Card backgrounds, borders (`#2A2A2A` → `#E2E2E2`), text colors swap correctly | ☐ |
| 3  | Verify ReviewPanel re-renders | Risk gauge, command block border, flag bullets adapt to light palette | ☐ |
| 4  | Toggle back (Moon → Sun) | Returns to exact original dark state | ☐ |

### 1.5 Notifications

| #  | Step | Expected Result | Pass / Fail |
|----|------|-----------------|:-----------:|
| 1  | Click bell icon in TopNav | Dropdown opens; unread count badge shows `4` | ☐ |
| 2  | Verify 4 notifications | (a) "Critical action requires review" – critical/red (b) "Action automatically blocked" – critical/red (c) "Medium-risk action pending" – warning/amber (d) "Compliance rule triggered" – critical/red | ☐ |
| 3  | Click "Mark all read" | All unread dot indicators cleared; badge count disappears | ☐ |
| 4  | Dismiss a notification (X button) | Notification removed from list | ☐ |

### 1.6 Account Popover

| #  | Step | Expected Result | Pass / Fail |
|----|------|-----------------|:-----------:|
| 1  | Click user avatar (right side of TopNav) | Account dropdown opens with: avatar, name/email, role ("Security Analyst"), session stats | ☐ |
| 2  | Check menu items render | Profile, Settings, Security Audit Log, API Keys — all render with icons and subtitles | ☐ |
| 3  | Check theme toggle in account menu | "Switch to Light Mode" with working toggle switch | ☐ |
| 4  | Check "Sign Out" button | Red text, LogOut icon, clickable (fires no navigation in demo — acceptable) | ☐ |

---

## 2  Mobile Viewport Checks

> Per RULES.md §5D: no horizontal overflow on phone widths; critical workflows must remain usable.
> Mobile breakpoint: `< 768 px` (from `useIsMobile(768)`).

### Target Viewports

| Device Proxy       | Width × Height |
|--------------------|----------------|
| iPhone 14 Pro      | 390 × 844     |
| iPhone 13 mini     | 375 × 812     |
| iPhone 14 Pro Max  | 430 × 932     |

**Setup**: DevTools → Toggle Device Toolbar → set each viewport → hard refresh.

### 2.1 No Horizontal Overflow

| #  | Step | Expected | 390×844 | 375×812 | 430×932 |
|----|------|----------|:-------:|:-------:|:-------:|
| 1  | Load dashboard | No horizontal scrollbar | ☐ | ☐ | ☐ |
| 2  | Scroll full page | Content stays within viewport at every scroll position | ☐ | ☐ | ☐ |
| 3  | Open notification dropdown | Dropdown ≤ viewport right edge | ☐ | ☐ | ☐ |
| 4  | Open account popover | Popover ≤ viewport right edge | ☐ | ☐ | ☐ |

### 2.2 Layout Adaptation

| #  | Check | Expected | 390×844 | 375×812 | 430×932 |
|----|-------|----------|:-------:|:-------:|:-------:|
| 1  | MetricsRow grid | `gridTemplateColumns: '1fr 1fr'` — 2-column layout | ☐ | ☐ | ☐ |
| 2  | Main split layout | `gridTemplateColumns: '1fr'` — single column; ActionFeed above ReviewPanel | ☐ | ☐ | ☐ |
| 3  | TopNav height | `48 px` (vs 56 desktop); logo `15 px` (vs 16); padding `12 px` | ☐ | ☐ | ☐ |
| 4  | TopNav divider | Vertical divider between logo group and status **hidden** | ☐ | ☐ | ☐ |
| 5  | "System Operational" label | Text hidden; only green dot visible | ☐ | ☐ | ☐ |
| 6  | Subtitle paragraph | "Real-time monitoring…" hidden (`!isMobile` guard) | ☐ | ☐ | ☐ |
| 7  | Heading font size | 17 px (vs 20 desktop) | ☐ | ☐ | ☐ |
| 8  | ReviewPanel action buttons | `flexDirection: 'column'` — buttons stack vertically | ☐ | ☐ | ☐ |
| 9  | MetricCard padding | `14px 16px` (vs `20px 22px` desktop) | ☐ | ☐ | ☐ |
| 10 | Sparkline hidden | "Total AI Actions Today" sparkline chart not rendered on mobile (`hasSparkline && !isMobile`) | ☐ | ☐ | ☐ |
| 11 | Footer layout | Switches to `flexDirection: 'column'` | ☐ | ☐ | ☐ |

### 2.3 Tap Target Safety

| #  | Control | Expected | 390×844 | 375×812 | 430×932 |
|----|---------|----------|:-------:|:-------:|:-------:|
| 1  | "Approve" button | Registers tap cleanly; no adjacent mis-fire | ☐ | ☐ | ☐ |
| 2  | "Block Action" button | Registers tap cleanly | ☐ | ☐ | ☐ |
| 3  | Action feed pending row | Correct row selected; ReviewPanel updates | ☐ | ☐ | ☐ |
| 4  | Theme toggle icon | Theme switches; no layout shift | ☐ | ☐ | ☐ |
| 5  | Notification bell | Dropdown opens | ☐ | ☐ | ☐ |
| 6  | Dismiss notification (X) | Correct notification removed | ☐ | ☐ | ☐ |

### 2.4 Critical Flow On Mobile

| #  | Step | Expected | Pass / Fail |
|----|------|----------|:-----------:|
| 1  | Load → scroll to ActionFeed → tap pending row | ReviewPanel updates below feed | ☐ |
| 2  | Scroll to ReviewPanel → read risk details | All text readable; no truncation hiding risk info | ☐ |
| 3  | Tap Approve → verify toast | Toast appears top-right; status changes | ☐ |
| 4  | Tap Block → verify toast | Toast appears; status changes | ☐ |
| 5  | Resolve all pending → verify empty state | "No action selected" empty state renders | ☐ |

---

## 3  Live Panel Truth Checks

> Per RULES.md §5B: every live panel must expose **source**, **last update time**, and **stale-state indicator**.

### 3.1 System Status Indicator (TopNav)

| #  | Check | Expected | Pass / Fail |
|----|-------|----------|:-----------:|
| 1  | Green pulsing dot | Dot uses `background: #30A46C` with `animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite` | ☐ |
| 2  | "System Operational" label | Visible on desktop; dot-only on mobile | ☐ |
| 3  | Sticky positioning | NavBar stays at top during scroll (`position: sticky; top: 0; zIndex: 50`) | ☐ |

### 3.2 Action Feed — Source & Timestamp

| #  | Check | Expected | Pass / Fail |
|----|-------|----------|:-----------:|
| 1  | Timestamp per row | Each row shows `timestamp` field (e.g., `14:32:01`) in monospace font | ☐ |
| 2  | Agent name (source) | Each row shows `agentName` (e.g., `agent-db-ops`, `agent-analytics`) | ☐ |
| 3  | Environment badge | `PROD` (red-tinted) or `STAGING` (blue/neutral) badge per row | ☐ |
| 4  | Risk status badge | Color-coded badge: `HIGH_RISK_PENDING` (red), `MEDIUM_RISK_PENDING` (amber), `APPROVED` (green), `HIGH_RISK_BLOCKED` (red), `LOW_RISK` (green) | ☐ |
| 5  | Data sourced from `mockData.ts` | 12 actions matching `mockActions` array; no claim of live API without backend wiring | ☐ |

### 3.3 Review Panel — Source Attribution

| #  | Check | Expected | Pass / Fail |
|----|-------|----------|:-----------:|
| 1  | Agent name displayed | Panel header shows agent source (e.g., `agent-db-ops`) | ☐ |
| 2  | Environment badge | `PROD` or `STAGING` badge in agent info section | ☐ |
| 3  | Timestamp displayed | Action timestamp shown (e.g., `14:32:01`) | ☐ |
| 4  | Numeric risk score | Gauge displays integer score (0–100) with color: red ≥ 80, amber ≥ 50, green < 50 | ☐ |
| 5  | Flag reasons sourced | Reasons array from `mockData.ts` rendered as bullet list | ☐ |

### 3.4 Metrics Row — Static Demo Values

| #  | Check | Expected | Pass / Fail |
|----|-------|----------|:-----------:|
| 1  | Values are static/demo | "1,245" / "4" / "12" / "94 %" — hardcoded in `MetricsRow.tsx` | ☐ |
| 2  | Subtitles render | "↑ +12% from yesterday" / "2 require urgent attention" / "3 blocked automatically" / "Last 24 hours" | ☐ |
| 3  | Sparkline (desktop) | "Total AI Actions Today" card includes Recharts AreaChart using `sparklineData` (12 data points) | ☐ |
| 4  | Color coding | Pending Reviews → amber (`#FFB224`); High-Risk → red (`#E5484D`); Approval Rate → green (`#30A46C`) | ☐ |
| 5  | Icons present | TrendingUp, Clock, AlertTriangle, CheckCircle icons respectively | ☐ |

### 3.5 Footer — Last Sync

| #  | Check | Expected | Pass / Fail |
|----|-------|----------|:-----------:|
| 1  | Version string | "Sentinel v2.4.1 · Enterprise AI Safety Monitor" | ☐ |
| 2  | Last sync time | "Last sync: just now" displayed | ☐ |
| 3  | System status dot (footer) | Green dot + "All systems normal" text | ☐ |

---

## 4  No Dead-Control Verification (Demo-Critical Flow)

> Per RULES.md §7: No dead clickable controls. Every button/link must either perform an action or be correctly disabled.

### 4.1 Demo-Critical Flow Definition

```
Load dashboard → View action feed → Select pending action →
Review details → Approve / Block → Observe state transition →
Repeat until empty → Verify empty state
```

### 4.2 Interactive Control Audit

| #  | Control | Location | Action | Expected Behavior | Dead? | Pass / Fail |
|----|---------|----------|--------|-------------------|:-----:|:-----------:|
| 1  | Theme toggle (Sun / Moon) | TopNav, right | Click | Toggles `isDark` state; full re-theme | No | ☐ |
| 2  | Notification bell | TopNav, right | Click | Opens notification dropdown | No | ☐ |
| 3  | "Mark all read" | Notification dropdown | Click | Sets all `unread: false`; badge clears | No | ☐ |
| 4  | Notification dismiss (X) | Per notification row | Click | Removes notification from list | No | ☐ |
| 5  | "View All Notifications" link | Notification dropdown footer | Click | **AUDIT**: must navigate or be absent. If present with no target → **DEAD** | ☐ | ☐ |
| 6  | User avatar button | TopNav, right | Click | Opens account popover | No | ☐ |
| 7  | Profile menu item | Account popover | Click | **AUDIT**: no `onClick` handler mapped → **DEAD** (visual-only in demo). Flag if `cursor: pointer` with no action. | ☐ | ☐ |
| 8  | Settings menu item | Account popover | Click | **AUDIT**: same as Profile — check for dead click | ☐ | ☐ |
| 9  | Security Audit Log item | Account popover | Click | **AUDIT**: same check | ☐ | ☐ |
| 10 | API Keys item | Account popover | Click | **AUDIT**: same check | ☐ | ☐ |
| 11 | Account theme toggle switch | Account popover | Click | Calls `onToggleTheme` — **functional** | No | ☐ |
| 12 | "Sign Out" button | Account popover | Click | **AUDIT**: no handler attached → **DEAD** unless explicitly a demo placeholder. Flag if `cursor: pointer` with no action. | ☐ | ☐ |
| 13 | Pending feed row | ActionFeed | Click | Calls `onSelectAction(action)` — selects action, updates ReviewPanel | No | ☐ |
| 14 | Non-pending feed row | ActionFeed | Click | Guard: `isPending && onSelectAction(action)` — click is a no-op; `cursor: default`. Not dead (intentionally inert). | No | ☐ |
| 15 | "Approve" (pending) | ReviewPanel | Click | Fires `onApprove(id)` → toast + state change | No | ☐ |
| 16 | "Block Action" (pending) | ReviewPanel | Click | Fires `onBlock(id)` → toast + state change | No | ☐ |
| 17 | "Approve" (resolved) | ReviewPanel | Click | `disabled={!isPending}` → `opacity: 0.4`, `cursor: not-allowed`, no action | Correctly disabled | ☐ |
| 18 | "Block Action" (resolved) | ReviewPanel | Click | Same disabled behavior | Correctly disabled | ☐ |

### 4.3 Absence & Orphan Checks

| #  | Check | Expected | Pass / Fail |
|----|-------|----------|:-----------:|
| 1  | No orphan "Escalate" button | `onEscalate` is wired in `App.tsx` and accepted by `ReviewPanel` prop, but **no Escalate button is rendered** in the JSX (only Approve + Block). Confirm no visible Escalate button in the UI. | ☐ |
| 2  | No sidebar trigger | `sidebar.tsx` exists in `components/ui/` but is **not imported or rendered** by `App.tsx`. Confirm no hamburger / sidebar toggle visible. | ☐ |
| 3  | No broken `<a href="#">` | Inspect rendered DOM: `document.querySelectorAll('a[href="#"], a[href="javascript:void(0)"]').length === 0` | ☐ |
| 4  | No unclickable cards | MetricCards use `div` (not button/link); confirm no `cursor: pointer` on metric cards (they are display-only). | ☐ |

---

## Summary Scorecard

| Section | Total Checks | Pass | Fail | Notes |
|---------|:------------:|:----:|:----:|-------|
| 1. UI State Verification | 28 | | | |
| 2. Mobile Viewport Checks (per-viewport × 3) | 72 | | | |
| 3. Live Panel Truth Checks | 21 | | | |
| 4. Dead-Control Verification | 22 | | | |
| **TOTAL** | **143** | | | |

**Pass Gate**: All demo-critical flow controls (§4.2 #1–4, #6, #13, #15–18) **must** pass. Remaining checks: ≥ 85 % pass rate.

---

## Screenshot Manifest

Capture and attach as evidence:

| #  | Screenshot Description | Suggested Filename |
|----|------------------------|--------------------|
| 1  | Desktop default load (dark) | `ui-b1-desktop-dark-default.png` |
| 2  | Desktop default load (light) | `ui-b1-desktop-light-default.png` |
| 3  | Desktop — Approve action toast | `ui-b1-desktop-approve-toast.png` |
| 4  | Desktop — Block action toast | `ui-b1-desktop-block-toast.png` |
| 5  | Desktop — Empty ReviewPanel (all resolved) | `ui-b1-desktop-empty-panel.png` |
| 6  | Desktop — Resolved action disabled buttons | `ui-b1-desktop-resolved-disabled.png` |
| 7  | Desktop — Notification dropdown open | `ui-b1-desktop-notifications.png` |
| 8  | Desktop — Account popover open | `ui-b1-desktop-account-popover.png` |
| 9  | Mobile 390×844 — Full page scroll | `ui-b1-mobile-390x844-full.png` |
| 10 | Mobile 375×812 — Full page scroll | `ui-b1-mobile-375x812-full.png` |
| 11 | Mobile 430×932 — Full page scroll | `ui-b1-mobile-430x932-full.png` |
| 12 | Mobile 390×844 — ReviewPanel buttons stacked | `ui-b1-mobile-390-buttons.png` |
| 13 | Mobile 375×812 — MetricsRow 2-col grid | `ui-b1-mobile-375-metrics.png` |

---

*Checklist version: TESTBENCH-UI-B1 v1.0 · Generated 2026-03-01*
*Source-of-truth components: `App.tsx`, `TopNav.tsx`, `MetricsRow.tsx`, `ActionFeed.tsx`, `ReviewPanel.tsx`, `mockData.ts`, `theme.ts`, `useIsMobile.ts`*

---

# TESTBENCH-BE-C1 — Backend Lifecycle and Integrity Validation

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
