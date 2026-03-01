# UI States Reference — Sentinel Dashboard

> Canonical state definitions for all UI components. Testbench checklists (e.g., `testbench/INFERENCE.md` §TESTBENCH-UI-B1) validate against this document.

## 1  Application States

| State | Trigger | Visual |
|-------|---------|--------|
| Default load (dark) | First visit / refresh | `bg: #0A0A0A`, `surface: #171717`, `isDark: true` |
| Default load (light) | Theme toggle | `bg: #F5F5F5`, `surface: #FFFFFF`, `isDark: false` |

## 2  ActionItem Risk Statuses

Defined in `frontend/src/app/types/index.ts`:

| `RiskStatus` | Badge Color | Selectable? | Actionable? |
|--------------|-------------|:-----------:|:-----------:|
| `HIGH_RISK_PENDING` | Red (`#E5484D`) | Yes | Yes (Approve / Block) |
| `MEDIUM_RISK_PENDING` | Amber (`#FFB224`) | Yes | Yes (Approve / Block) |
| `LOW_RISK` | Green (`#30A46C`) | No | No |
| `APPROVED` | Green (`#30A46C`) | No | No |
| `HIGH_RISK_BLOCKED` | Red (`#E5484D`) | No | No |

**Selectable**: feed row `cursor: pointer`; clicking fires `onSelectAction`.
**Actionable**: ReviewPanel Approve/Block buttons enabled (`isPending === true`).

## 3  ReviewPanel States

| State | Condition | Visual |
|-------|-----------|--------|
| **Populated — pending** | `action !== null && isPending` | Full details + Approve/Block buttons **enabled** |
| **Populated — resolved** | `action !== null && !isPending` | Full details + buttons **disabled** (`opacity: 0.4`, `cursor: not-allowed`) + "already resolved" banner |
| **Empty / null** | `action === null` | Info icon + "No action selected" + "Click a pending review in the feed" |

## 4  Notification States

| State | Condition | Visual |
|-------|-----------|--------|
| Unread present | `unreadCount > 0` | Red badge on bell icon showing count |
| All read | `unreadCount === 0` | No badge; notifications remain in list |
| Empty | All dismissed | Empty notification list |

Each notification has a `level`:

| Level | Icon | Dot Color | Background |
|-------|------|-----------|------------|
| `critical` | Ban | `#E5484D` | `rgba(229,72,77,0.14)` |
| `warning` | AlertTriangle | `#F5A524` | `rgba(245,165,36,0.14)` |
| `info` | Clock3 | `#3B82F6` | `rgba(59,130,246,0.14)` |

## 5  Theme States

Two themes controlled by `isDark` boolean and `getTheme()` in `utils/theme.ts`:

| Property | Dark | Light |
|----------|------|-------|
| `bg` | `#0A0A0A` | `#F5F5F5` |
| `surface` | `#171717` | `#FFFFFF` |
| `surfaceElevated` | `#1E1E1E` | `#FAFAFA` |
| `border` | `#2A2A2A` | `#E2E2E2` |
| `textPrimary` | `#F5F5F5` | `#0A0A0A` |
| `textSecondary` | `#8A8A8A` | `#5A5A5A` |
| `textTertiary` | `#4A4A4A` | `#ADADAD` |

## 6  Responsive Breakpoints

Single breakpoint: **768 px** (`useIsMobile(768)`).

| Property | Desktop (≥ 768) | Mobile (< 768) |
|----------|-----------------|----------------|
| TopNav height | 56 px | 48 px |
| TopNav logo | 16 px | 15 px |
| TopNav divider | Visible | Hidden |
| "System Operational" label | Visible | Hidden (dot only) |
| Subtitle paragraph | Visible | Hidden |
| Heading font | 20 px | 17 px |
| MetricsRow grid | `repeat(4, 1fr)` | `1fr 1fr` |
| Sparkline chart | Rendered | Hidden |
| Main layout | `60% 40%` | `1fr` (stacked) |
| ReviewPanel buttons | `row` | `column` |
| MetricCard padding | `20px 22px` | `14px 16px` |
| Content padding | `0 24px 40px` | `0 12px 32px` |
| Footer direction | `row` | `column` |

## 7  Accent Color Constants

From `utils/theme.ts`:

| Name | Hex | Usage |
|------|-----|-------|
| `red` | `#E5484D` | High risk, blocked, critical |
| `amber` | `#FFB224` | Medium risk, warning, pending |
| `green` | `#30A46C` | Approved, low risk, operational |
| `redMuted` | `rgba(229,72,77,0.12)` | Background tint |
| `amberMuted` | `rgba(255,178,36,0.12)` | Background tint |
| `greenMuted` | `rgba(48,164,108,0.12)` | Background tint |

## 8  Mock Data Contract

Source: `frontend/src/app/data/mockData.ts`

- **12 actions** in `mockActions` array
- **Pending actions** (demo-critical): `act-001`, `act-003`, `act-007`, `act-008`, `act-012`
- **Pre-blocked**: `act-004` (riskScore 99), `act-009` (riskScore 97)
- **Sparkline**: 12 hourly data points in `sparklineData`
- **Metric values** (hardcoded in `MetricsRow.tsx`): 1,245 / 4 / 12 / 94%

---

*Version: 1.0 · Last updated: 2026-03-01*
