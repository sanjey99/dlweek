text
Design a professional financial intelligence dashboard UI 
inspired by the Bloomberg Terminal aesthetic.

─── VISUAL LANGUAGE
- Color palette: Near-black background (#0A0D11), 
  Bloomberg orange accent (#FF6B00), electric cyan (#00D4FF) 
  for data highlights, muted green (#00FF9C) for positive signals, 
  red (#FF3B3B) for risk/alerts, off-white (#E8E8E8) for body text
- Typography: Monospace font (JetBrains Mono or IBM Plex Mono) 
  for all data/numbers, clean sans-serif (Inter) for labels/UI copy
- Dense information layout — data-first, no wasted whitespace
- Thin 1px borders in #1E2530 to separate panels
- Subtle grid lines on charts only, no decorative elements

─── LAYOUT STRUCTURE
Top bar:
- Platform name "FIN·IQ" left-aligned in orange monospace
- Live clock + market status indicator (dot: green/red)
- Tab navigation: [RISK SCORE] [FRAUD DETECT] [PORTFOLIO]
- Alert bell icon with badge count, user avatar right-aligned

Left sidebar (persistent, 220px):
- Mini stat cards for 4 KPIs: Active Alerts / Models Running 
  / Avg Confidence / Last Inference timestamp
- Each card: large monospace number, small label below, 
  colored left border matching signal severity

─── SCREEN 1: RISK SCORE TAB
Main panel split 60/40:
Left — Input form panel:
  - Section header "RISK ASSESSMENT ENGINE" in small caps, orange
  - Input fields styled as terminal prompts (> label: [input])
  - Fields: Loan Amount, Credit Score, Debt-to-Income, 
    Industry Sector (dropdown), Loan Tenor
  - "RUN MODEL" button: full-width, orange fill, monospace caps

Right — Output panel:
  - Large circular gauge (donut chart) showing Risk Score 0–100
    Color: green (0–40), yellow (40–70), red (70–100)
  - Score number centered inside gauge in large monospace
  - Below gauge: Confidence % and Risk Tier badge 
    (LOW / MEDIUM / HIGH / CRITICAL)
  - SHAP feature importance horizontal bar chart below:
    5 bars, colored by positive/negative contribution
  - Section label: "TOP CONTRIBUTING FACTORS"

─── SCREEN 2: FRAUD DETECT TAB
Full-width transaction feed table:
  - Columns: TXN ID | Timestamp | Amount | Merchant | 
    Channel | Fraud Score | Status
  - Rows alternate #0D1117 / #111820
  - Fraud Score column: inline mini bar, color-coded
  - Status badges: CLEAR (green) / REVIEW (yellow) / FLAGGED (red)
  - Table header row in orange small-caps

Right panel (slide-out drawer style, 340px):
  - Triggered on row click
  - Header: "TRANSACTION DETAIL"
  - Anomaly breakdown: radar/spider chart with 6 axes
    (velocity, geo-risk, device trust, merchant risk, 
    time anomaly, amount deviation)
  - Decision: model verdict + confidence + rule triggers fired
  - Action buttons: [APPROVE] [ESCALATE] [BLOCK] 
    styled as terminal command buttons

─── SCREEN 3: PORTFOLIO OPTIMIZER TAB
Three-panel layout:

Left panel (300px) — Portfolio Input:
  - Asset allocation input list: ticker + weight % per row
  - Add/remove rows like a terminal entry form
  - Constraints: Max volatility slider, Min return target
  - "OPTIMIZE" button

Center panel — Allocation Visualization:
  - Treemap chart of current vs optimized allocation
  - Color intensity = weight, border flash = change detected
  - Below: Efficient frontier curve (scatter plot)
    Mark current portfolio + optimized point in orange

Right panel — Alerts & Metrics:
  - Portfolio health score (large number, color-coded)
  - 4 metric rows: Sharpe Ratio / VaR (95%) / 
    Max Drawdown / Expected Return
  - Alert feed: scrollable list, each alert has 
    severity dot + message + timestamp
  - All numbers in monospace, updating with subtle fade animation

─── COMPONENT DETAILS
Charts: Use Recharts or Chart.js style — no rounded corners, 
  angular/terminal aesthetic, minimal chart chrome
Micro-interactions: 
  - Cursor blink on active input fields
  - Row highlight on hover (thin orange left border appears)
  - Score gauges animate on load (0 → final value, 800ms ease)
  - Alert badges pulse once on new entry
Spacing: 16px base grid, 8px internal padding for cards
Corner radius: 2px only — sharp, terminal-like, never bubbly

─── DELIVERABLES IN FIGMA
1. Desktop frame 1440×900
2. Component library: 
   - Stat card, Data table row (normal/flagged), 
     Badge (4 states), Input field (terminal style), 
     Chart panel container, Alert item
3. Three tab screens as separate frames
4. Hover + active states for buttons and table rows
5. Auto layout used throughout for responsiveness
