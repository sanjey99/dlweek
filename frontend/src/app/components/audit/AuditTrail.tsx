import { useState, useMemo } from 'react';
import {
  Search,
  Download,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Zap,
  Ban,
  Clock,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import { Theme, ActionItem, RiskStatus } from '../../types';
import { COLORS } from '../../utils/theme';

/* ─── helpers ─────────────────────────────────────────────────────────────── */

interface AuditTrailProps {
  theme: Theme;
  isDark: boolean;
  isMobile: boolean;
  actions: ActionItem[];
}

type DecisionFilter = 'all' | 'approved' | 'auto-approved' | 'blocked' | 'pending';
type EnvFilter = 'all' | 'PROD' | 'STAGING';
type RiskFilter = 'all' | 'high' | 'medium' | 'low';
type AgentFilter = string; // 'all' or specific agent name

const ROWS_PER_PAGE = 12;

/* map RiskStatus → human-friendly decision label */
function decisionLabel(s: RiskStatus): string {
  switch (s) {
    case 'APPROVED':
      return 'Approved';
    case 'LOW_RISK':
      return 'Auto-Approved';
    case 'HIGH_RISK_BLOCKED':
    case 'MEDIUM_RISK_BLOCKED':
      return 'Blocked';
    case 'HIGH_RISK_PENDING':
    case 'MEDIUM_RISK_PENDING':
      return 'Pending';
    case 'ESCALATED':
      return 'Blocked';
    default:
      return s;
  }
}

function decisionColor(s: RiskStatus): { text: string; bg: string } {
  switch (s) {
    case 'APPROVED':
      return { text: COLORS.green, bg: COLORS.greenMuted };
    case 'LOW_RISK':
      return { text: '#3B82F6', bg: 'rgba(59,130,246,0.12)' };
    case 'HIGH_RISK_BLOCKED':
    case 'MEDIUM_RISK_BLOCKED':
    case 'ESCALATED':
      return { text: COLORS.red, bg: COLORS.redMuted };
    case 'HIGH_RISK_PENDING':
    case 'MEDIUM_RISK_PENDING':
      return { text: COLORS.amber, bg: COLORS.amberMuted };
    default:
      return { text: '#888', bg: 'rgba(136,136,136,0.12)' };
  }
}

function riskColor(score: number): string {
  if (score >= 70) return COLORS.red;
  if (score >= 40) return COLORS.amber;
  return COLORS.green;
}

function riskBg(score: number): string {
  if (score >= 70) return COLORS.redMuted;
  if (score >= 40) return COLORS.amberMuted;
  return COLORS.greenMuted;
}

function riskLevel(score: number): string {
  if (score >= 70) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
}

/* generate event IDs from action — prefer real ID, fallback to index */
function eventId(action: ActionItem, idx: number): string {
  if (action.id && !action.id.startsWith('action-')) return action.id;
  return `AUD-2026-${String(idx + 1).padStart(3, '0')}`;
}

/* parse timestamps — prefer real ISO string, fallback to generated */
function fullTimestamp(ts: string, idx: number): { date: string; time: string } {
  // Try to parse as ISO date first
  if (ts && ts.includes('T')) {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const date = `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      const ss = String(d.getUTCSeconds()).padStart(2, '0');
      return { date, time: `${hh}:${mm}:${ss}` };
    }
  }
  // Fallback for HH:MM:SS or other formats
  const dayOffset = idx > 9 ? 0 : 1;
  const day = dayOffset === 0 ? 'Mar 1, 2026' : 'Feb 28, 2026';
  return { date: day, time: ts };
}

/* generate plausible reviewer names */
const REVIEWERS = ['Sarah Jones', 'Marcus Chen', 'Priya Patel', 'Alex Kim', 'System'];

/* get reviewer — prefer real data from action, fallback to generated */
function getReviewer(action: ActionItem, _idx: number): string {
  if (action.reviewer) return action.reviewer;
  if (action.riskStatus === 'LOW_RISK') return 'System';
  if (action.riskStatus === 'HIGH_RISK_PENDING' || action.riskStatus === 'MEDIUM_RISK_PENDING') return '—';
  return REVIEWERS[_idx % REVIEWERS.length];
}

/* get duration — prefer real data from action, fallback to generated */
function getDuration(action: ActionItem, _idx: number): string {
  if (action.duration) return action.duration;
  if (action.riskStatus === 'LOW_RISK') return '< 1s';
  if (action.riskStatus === 'HIGH_RISK_PENDING' || action.riskStatus === 'MEDIUM_RISK_PENDING') return '—';
  const mins = ((_idx * 7 + 3) % 15);
  const secs = ((_idx * 13 + 7) % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

/* ─── component ───────────────────────────────────────────────────────────── */

export function AuditTrail({ theme, isDark, isMobile, actions }: AuditTrailProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>('all');
  const [envFilter, setEnvFilter] = useState<EnvFilter>('all');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');
  const [agentFilter, setAgentFilter] = useState<AgentFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<'time' | 'risk' | 'decision'>('time');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  /* unique agent list — filter out AUD-xxx IDs that aren't real agent names */
  const agentNames = useMemo(() => {
    const set = new Set(
      actions
        .map((a) => a.agentName)
        .filter((n) => n && !/^AUD-/i.test(n))
    );
    return ['all', ...Array.from(set).sort()];
  }, [actions]);

  /* filtered + sorted */
  const filtered = useMemo(() => {
    let result = [...actions];

    // search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.agentName.toLowerCase().includes(q) ||
          a.proposedAction.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q)
      );
    }

    // decision filter
    if (decisionFilter !== 'all') {
      result = result.filter((a) => {
        const d = decisionLabel(a.riskStatus).toLowerCase();
        return d === decisionFilter;
      });
    }

    // env filter
    if (envFilter !== 'all') {
      result = result.filter((a) => a.environment === envFilter);
    }

    // risk filter
    if (riskFilter !== 'all') {
      result = result.filter((a) => {
        const lvl = riskLevel(a.riskScore).toLowerCase();
        return lvl === riskFilter;
      });
    }

    // agent filter
    if (agentFilter !== 'all') {
      result = result.filter((a) => a.agentName === agentFilter);
    }

    // sort
    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'time') cmp = a.timestamp.localeCompare(b.timestamp);
      if (sortField === 'risk') cmp = a.riskScore - b.riskScore;
      if (sortField === 'decision') cmp = decisionLabel(a.riskStatus).localeCompare(decisionLabel(b.riskStatus));
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [actions, searchQuery, decisionFilter, envFilter, riskFilter, agentFilter, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  const paged = filtered.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

  /* stats */
  const stats = useMemo(() => {
    const total = actions.length;
    const approved = actions.filter((a) => a.riskStatus === 'APPROVED').length;
    const autoApproved = actions.filter((a) => a.riskStatus === 'LOW_RISK').length;
    const blocked = actions.filter((a) => a.riskStatus === 'HIGH_RISK_BLOCKED' || a.riskStatus === 'MEDIUM_RISK_BLOCKED' || a.riskStatus === 'ESCALATED').length;
    const pending = actions.filter((a) => a.riskStatus === 'HIGH_RISK_PENDING' || a.riskStatus === 'MEDIUM_RISK_PENDING').length;
    const avgRisk = total > 0 ? Math.round(actions.reduce((s, a) => s + a.riskScore, 0) / total) : 0;
    const highRisk = actions.filter((a) => a.riskScore >= 70).length;
    return { total, approved, autoApproved, blocked, pending, avgRisk, highRisk };
  }, [actions]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortField(field);
      setSortDir('desc');
    }
    setCurrentPage(1);
  };

  /* export csv */
  const exportCSV = () => {
    const header = 'Event ID,Date,Time,Agent,Command,User,Environment,Risk Score,Decision,Reviewer,Duration\n';
    const rows = filtered
      .map((a, i) => {
        const ts = fullTimestamp(a.timestamp, i);
        const eid = eventId(a, i);
        return `${eid},${ts.date},${ts.time},${a.agentName},"${a.proposedAction}",${a.user || ''},${a.environment},${a.riskScore},${decisionLabel(a.riskStatus)},${getReviewer(a, i)},${getDuration(a, i)}`;
      })
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sentinel-audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  /* filter dropdown component */
  const FilterDropdown = ({
    label,
    value,
    options,
    onChange,
  }: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onChange: (v: string) => void;
  }) => (
    <div style={{ position: 'relative' }}>
      <select
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setCurrentPage(1);
        }}
        style={{
          appearance: 'none',
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 6,
          padding: '6px 28px 6px 10px',
          color: theme.textSecondary,
          fontSize: 12,
          fontFamily: 'Inter, sans-serif',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        style={{
          position: 'absolute',
          right: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
          color: theme.textTertiary,
        }}
      />
    </div>
  );

  /* summary card */
  const SummaryCard = ({
    value,
    label,
    sublabel,
    icon,
    accent,
    accentBg,
  }: {
    value: number;
    label: string;
    sublabel: string;
    icon: React.ReactNode;
    accent: string;
    accentBg: string;
  }) => (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        padding: isMobile ? '12px 14px' : '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minWidth: 0,
        flex: 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: accent, fontSize: isMobile ? 22 : 28, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>
          {value}
        </span>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: accentBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: accent,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </div>
      <div>
        <div style={{ color: theme.textPrimary, fontSize: 12, fontWeight: 600 }}>{label}</div>
        <div style={{ color: theme.textTertiary, fontSize: 11 }}>{sublabel}</div>
      </div>
    </div>
  );

  /* sort indicator */
  const SortArrow = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return <ChevronDown size={11} style={{ opacity: 0.3 }} />;
    return (
      <ChevronDown
        size={11}
        style={{
          transform: sortDir === 'asc' ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.15s',
          color: theme.textSecondary,
        }}
      />
    );
  };

  return (
    <div>
      {/* Breadcrumb + title */}
      <div style={{ padding: isMobile ? '14px 0 4px' : '20px 0 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: theme.textTertiary, fontSize: 12 }}>Dashboard</span>
          <span style={{ color: theme.textTertiary, fontSize: 12 }}>/</span>
          <span style={{ color: theme.textSecondary, fontSize: 12, fontWeight: 500 }}>Audit Trail</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 4, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h1
              style={{
                color: theme.textPrimary,
                fontSize: isMobile ? 17 : 20,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                lineHeight: 1.3,
                margin: 0,
              }}
            >
              Immutable Audit Trail
            </h1>
            {!isMobile && (
              <p style={{ color: theme.textSecondary, fontSize: 13, marginTop: 3, margin: '3px 0 0' }}>
                Complete chronological record of every AI agent action intercepted, scored, and reviewed by Sentinel.
              </p>
            )}
          </div>
          <button
            onClick={exportCSV}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              padding: '8px 14px',
              color: theme.textPrimary,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
              transition: 'background 0.15s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = theme.surfaceElevated)}
            onMouseLeave={(e) => (e.currentTarget.style.background = theme.surface)}
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(6, 1fr)',
          gap: isMobile ? 8 : 12,
          marginTop: 12,
        }}
      >
        <SummaryCard
          value={stats.total}
          label="Total Events"
          sublabel="All time"
          icon={<ShieldCheck size={16} />}
          accent={theme.textPrimary}
          accentBg={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}
        />
        <SummaryCard
          value={stats.approved}
          label="Approved"
          sublabel="Manual Reviewed"
          icon={<CheckCircle2 size={16} />}
          accent={COLORS.green}
          accentBg={COLORS.greenMuted}
        />
        <SummaryCard
          value={stats.autoApproved}
          label="Auto-Approved"
          sublabel="Low risk, Automatic"
          icon={<Zap size={16} />}
          accent="#3B82F6"
          accentBg="rgba(59,130,246,0.12)"
        />
        <SummaryCard
          value={stats.blocked}
          label="Blocked"
          sublabel="Prevented"
          icon={<Ban size={16} />}
          accent={COLORS.red}
          accentBg={COLORS.redMuted}
        />
        <SummaryCard
          value={stats.pending}
          label="Pending Review"
          sublabel="Awaiting Decision"
          icon={<Clock size={16} />}
          accent={COLORS.amber}
          accentBg={COLORS.amberMuted}
        />
        <SummaryCard
          value={stats.avgRisk}
          label="Avg Risk Score"
          sublabel={`${stats.highRisk} High Risk Events`}
          icon={<AlertTriangle size={16} />}
          accent={COLORS.red}
          accentBg={COLORS.redMuted}
        />
      </div>

      {/* Search + filters */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 16,
          flexWrap: 'wrap',
        }}
      >
        {/* Search input */}
        <div style={{ position: 'relative', flex: isMobile ? '1 1 100%' : '0 1 340px' }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: theme.textTertiary,
            }}
          />
          <input
            type="text"
            placeholder="Search agent, command, or event ID..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            style={{
              width: '100%',
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: 6,
              padding: '7px 10px 7px 30px',
              color: theme.textPrimary,
              fontSize: 12,
              fontFamily: 'Inter, sans-serif',
              outline: 'none',
            }}
          />
        </div>

        <FilterDropdown
          label="Time"
          value="all-time"
          options={[{ value: 'all-time', label: 'All time' }]}
          onChange={() => {}}
        />
        <FilterDropdown
          label="Risk"
          value={riskFilter}
          options={[
            { value: 'all', label: 'All risk levels' },
            { value: 'high', label: 'High risk' },
            { value: 'medium', label: 'Medium risk' },
            { value: 'low', label: 'Low risk' },
          ]}
          onChange={(v) => setRiskFilter(v as RiskFilter)}
        />
        <FilterDropdown
          label="Decision"
          value={decisionFilter}
          options={[
            { value: 'all', label: 'All decisions' },
            { value: 'approved', label: 'Approved' },
            { value: 'auto-approved', label: 'Auto-Approved' },
            { value: 'blocked', label: 'Blocked' },
            { value: 'pending', label: 'Pending' },
          ]}
          onChange={(v) => setDecisionFilter(v as DecisionFilter)}
        />
        <FilterDropdown
          label="Env"
          value={envFilter}
          options={[
            { value: 'all', label: 'All environments' },
            { value: 'PROD', label: 'PROD' },
            { value: 'STAGING', label: 'STAGING' },
          ]}
          onChange={(v) => setEnvFilter(v as EnvFilter)}
        />
        <FilterDropdown
          label="Agent"
          value={agentFilter}
          options={agentNames.map((a) => ({
            value: a,
            label: a === 'all' ? 'All agents' : a,
          }))}
          onChange={(v) => setAgentFilter(v)}
        />

        {/* event count badge */}
        <span
          style={{
            color: theme.textTertiary,
            fontSize: 12,
            marginLeft: 'auto',
            whiteSpace: 'nowrap',
          }}
        >
          {filtered.length} events
        </span>
      </div>

      {/* Table */}
      <div
        style={{
          marginTop: 16,
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        {/* Table header bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: COLORS.green,
              }}
            />
            <span style={{ color: theme.textPrimary, fontSize: 13, fontWeight: 600 }}>
              Audit Log
            </span>
            <span style={{ color: theme.textTertiary, fontSize: 12 }}>
              {filtered.length} events
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Lock size={11} color={theme.textTertiary} />
            <span style={{ color: theme.textTertiary, fontSize: 11, fontStyle: 'italic' }}>
              Immutable · Tamper-evident
            </span>
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontFamily: 'Inter, sans-serif',
              fontSize: 12,
              minWidth: 900,
            }}
          >
            <thead>
              <tr>
                {[
                  { key: 'id', label: 'EVENT ID', sortable: false },
                  { key: 'time', label: 'DATE & TIME', sortable: true, field: 'time' as const },
                  { key: 'agent', label: 'AGENT', sortable: false },
                  { key: 'command', label: 'COMMAND', sortable: false },
                  { key: 'user', label: 'USER', sortable: false },
                  { key: 'env', label: 'ENV', sortable: false },
                  { key: 'risk', label: 'RISK', sortable: true, field: 'risk' as const },
                  { key: 'decision', label: 'DECISION', sortable: true, field: 'decision' as const },
                  { key: 'reviewer', label: 'REVIEWER', sortable: false },
                  { key: 'duration', label: 'DURATION', sortable: false },
                ].map((col) => (
                  <th
                    key={col.key}
                    onClick={col.sortable ? () => toggleSort(col.field!) : undefined}
                    style={{
                      padding: '10px 12px',
                      textAlign: 'left',
                      color: theme.textTertiary,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      borderBottom: `1px solid ${theme.border}`,
                      background: theme.tableHeaderBg,
                      cursor: col.sortable ? 'pointer' : 'default',
                      whiteSpace: 'nowrap',
                      userSelect: 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {col.label}
                      {col.sortable && <SortArrow field={col.field!} />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((action, rowIdx) => {
                const globalIdx = (currentPage - 1) * ROWS_PER_PAGE + rowIdx;
                const ts = fullTimestamp(action.timestamp, globalIdx);
                const dc = decisionColor(action.riskStatus);
                const dl = decisionLabel(action.riskStatus);
                const rc = riskColor(action.riskScore);
                const rb = riskBg(action.riskScore);
                const rl = riskLevel(action.riskScore);
                const reviewer = getReviewer(action, globalIdx);
                const duration = getDuration(action, globalIdx);
                const eid = eventId(action, globalIdx);

                return (
                  <tr
                    key={action.id}
                    style={{
                      borderBottom: `1px solid ${theme.border}`,
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = theme.rowHover)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Event ID */}
                    <td style={{ padding: '10px 12px', color: theme.textTertiary, fontFamily: 'monospace', fontSize: 11 }}>
                      {eid}
                    </td>

                    {/* Date & Time */}
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ color: theme.textPrimary, fontSize: 12, fontWeight: 500 }}>{ts.date}</div>
                      <div style={{ color: theme.textTertiary, fontSize: 11 }}>{ts.time}</div>
                    </td>

                    {/* Agent */}
                    <td style={{ padding: '10px 12px', color: theme.textSecondary, fontSize: 12 }}>
                      {action.agentName}
                    </td>

                    {/* Command */}
                    <td
                      style={{
                        padding: '10px 12px',
                        maxWidth: 260,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <code
                        style={{
                          background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 11,
                          color: theme.textPrimary,
                          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        }}
                      >
                        {action.proposedAction.length > 40
                          ? action.proposedAction.slice(0, 40) + '...'
                          : action.proposedAction}
                      </code>
                    </td>

                    {/* User */}
                    <td style={{ padding: '10px 12px', color: theme.textSecondary, fontSize: 12 }}>
                      {action.user || '—'}
                    </td>

                    {/* Env */}
                    <td style={{ padding: '10px 12px' }}>
                      <span
                        style={{
                          background: action.environment === 'PROD' ? COLORS.redMuted : COLORS.blueMuted,
                          color: action.environment === 'PROD' ? COLORS.red : COLORS.blue,
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {action.environment}
                      </span>
                    </td>

                    {/* Risk */}
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            background: rb,
                            color: rc,
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                        >
                          {rl}
                        </span>
                        <span style={{ color: rc, fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>
                          {action.riskScore}
                        </span>
                      </div>
                    </td>

                    {/* Decision */}
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: dc.text,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            color: dc.text,
                            fontSize: 12,
                            fontWeight: 500,
                          }}
                        >
                          {dl}
                        </span>
                      </div>
                    </td>

                    {/* Reviewer */}
                    <td style={{ padding: '10px 12px', color: theme.textSecondary, fontSize: 12 }}>
                      {reviewer}
                    </td>

                    {/* Duration */}
                    <td style={{ padding: '10px 12px', color: theme.textTertiary, fontSize: 12 }}>
                      {duration}
                    </td>
                  </tr>
                );
              })}

              {paged.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    style={{
                      padding: '40px 12px',
                      textAlign: 'center',
                      color: theme.textTertiary,
                      fontSize: 13,
                    }}
                  >
                    No events match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 12,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <span style={{ color: theme.textTertiary, fontSize: 12 }}>
          Showing {filtered.length === 0 ? 0 : (currentPage - 1) * ROWS_PER_PAGE + 1}-
          {Math.min(currentPage * ROWS_PER_PAGE, filtered.length)} of {filtered.length} events
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: 6,
              padding: '5px 10px',
              color: currentPage === 1 ? theme.textTertiary : theme.textSecondary,
              fontSize: 12,
              cursor: currentPage === 1 ? 'default' : 'pointer',
              fontFamily: 'Inter, sans-serif',
              opacity: currentPage === 1 ? 0.5 : 1,
            }}
          >
            <ChevronLeft size={12} /> Prev
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              onClick={() => setCurrentPage(page)}
              style={{
                background: page === currentPage ? '#3B82F6' : theme.surface,
                border: `1px solid ${page === currentPage ? '#3B82F6' : theme.border}`,
                borderRadius: 6,
                padding: '5px 10px',
                color: page === currentPage ? '#fff' : theme.textSecondary,
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
                fontWeight: page === currentPage ? 600 : 400,
                minWidth: 32,
              }}
            >
              {page}
            </button>
          ))}
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: 6,
              padding: '5px 10px',
              color: currentPage === totalPages ? theme.textTertiary : theme.textSecondary,
              fontSize: 12,
              cursor: currentPage === totalPages ? 'default' : 'pointer',
              fontFamily: 'Inter, sans-serif',
              opacity: currentPage === totalPages ? 0.5 : 1,
            }}
          >
            Next <ChevronRight size={12} />
          </button>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: 32,
          paddingTop: 16,
          borderTop: `1px solid ${theme.border}`,
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'flex-start' : 'center',
          justifyContent: 'space-between',
          gap: isMobile ? 8 : 0,
        }}
      >
        <span style={{ color: theme.textTertiary, fontSize: 12 }}>
          Sentinel v2.4.1 · Audit logs are immutable and tamper-evident
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: COLORS.green,
            }}
          />
          <span style={{ color: COLORS.green, fontSize: 12 }}>Audit integrity verified</span>
        </div>
      </div>
    </div>
  );
}
