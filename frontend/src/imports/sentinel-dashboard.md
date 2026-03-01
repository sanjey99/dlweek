Generate a high-fidelity, responsive web application dashboard for "Sentinel," an enterprise AI safety monitor. The UI must be professional, minimal, and highly legible, drawing inspiration from Bloomberg Terminals and Vercel's dark mode aesthetics. 

DESIGN CONSTRAINTS & THEMING:
- Theme: Implement a robust Dark Mode as the default (backgrounds: #0A0A0A, surface panels: #171717) with a toggle for Light Mode (backgrounds: #FAFAFA, surface panels: #FFFFFF).
- Typography: Use a clean geometric sans-serif (like Inter or Roboto) for all UI labels and headings. Use a monospace font (like JetBrains Mono or IBM Plex Mono) exclusively for code snippets, database queries, and system logs.
- Color Palette: Use monochromatic grays for structure and text. Use vivid semantic accents sparingly but deliberately: Crimson Red (#E5484D) for High Risk/Blocked actions, Amber Yellow (#FFB224) for Medium Risk/Pending actions, and Emerald Green (#30A46C) for Approved/Low Risk actions.
- Layout Intent: Desktop-first, responsive, utilizing a clean, card-based CSS grid layout with generous padding and no cluttered borders.

PAGE STRUCTURE & REQUIRED SECTIONS (Top to Bottom):
1. Top Navigation Bar:
- Left: "Sentinel" logo text with a pulsing green "System Operational" status indicator.
- Right: Theme toggle icon (Sun/Moon), a notification bell with a red badge, and a user profile avatar.

2. Overview Metrics Row (4 Cards horizontally):
- Total AI Actions Today (e.g., "1,245" with a small subtle sparkline chart)
- Pending Reviews (e.g., "4" highlighted in Amber)
- High-Risk Interventions (e.g., "12" highlighted in Red)
- Global Approval Rate (e.g., "94%" in Green)

3. Main Content Split Layout (Left: 60%, Right: 40%):

LEFT COLUMN - "Live AI Action Feed":
- A clean, scrollable table or list view showing recent AI agent activity.
- Columns: Timestamp, Agent Name (e.g., `agent-db-ops`), Proposed Action (e.g., `DROP TABLE users_backup;` in monospace font), Environment badge (PROD/STAGING), and a colored Risk Status badge.
- Include one prominent row that is flagged as "HIGH RISK - PENDING REVIEW".

RIGHT COLUMN - "Active Review Panel" (The Human-in-the-Loop interface):
- A sticky, elevated card displaying the details of the currently selected "Pending Review" action.
- Show the Agent Name and the exact monospace code command it wants to execute.
- Display an "ML Risk Score" gauge or bar (e.g., "94/100" in Red).
- Below the score, list 3 bullet points explaining why it was flagged (e.g., "Destructive SQL operation detected", "Target environment is Production").
- At the bottom of the card, place three large, accessible action buttons side-by-side: "Approve" (Outlined Green), "Escalate" (Outlined Amber), and "Block Action" (Solid Red).

COMPLETION CRITERIA:
Deliver a complete, visually balanced dashboard that looks like a premium developer tool. Ensure the distinction between the monitoring feed and the active human review panel is visually obvious. Create separate code folders for each major section to ensure maintainability.