import { useState, useMemo } from 'react';
import {
  Users, Bot, TrendingUp, Ban, AlertTriangle, ChevronDown, ChevronUp, ChevronRight,
  Search, Building2, Zap, ShieldCheck, FileSpreadsheet,
} from 'lucide-react';
import { Theme, ActionItem } from '../../types';
import { TeamData, TeamStatus } from '../../data/organisationData';
import { CsvImportModal } from './CsvImportModal';
import type { ParsedAuditEvent } from '../../utils/csvParser';

interface OrganisationPageProps {
  theme: Theme;
  isDark: boolean;
  isMobile: boolean;
  onViewTeamAudit?: (teamId: string, teamName: string) => void;
  onViewAllAudits?: () => void;
  importedTeams?: TeamData[];
  onImportComplete?: (teams: TeamData[], auditActions: ActionItem[], auditEventsRaw: ParsedAuditEvent[]) => void;
}

/* ─── Status badge colours ─────────────────────────── */
const statusStyles: Record<TeamStatus, { bg: string; color: string; dot: string }> = {
  Operational: { bg: 'rgba(48,164,108,0.14)', color: '#30A46C', dot: '#30A46C' },
  'Elevated Risk': { bg: 'rgba(229,72,77,0.14)', color: '#E5484D', dot: '#E5484D' },
  'Under Review': { bg: 'rgba(59,130,246,0.14)', color: '#3B82F6', dot: '#3B82F6' },
  'Active Incident': { bg: 'rgba(229,72,77,0.18)', color: '#E5484D', dot: '#E5484D' },
};

/* ─── Risk score bar colour ────────────────────────── */
function riskColor(score: number) {
  if (score >= 70) return '#E5484D';
  if (score >= 45) return '#F5A524';
  return '#30A46C';
}

/* ─── Avatar circle ────────────────────────────────── */
function Avatar({ initials, color, size = 28 }: { initials: string; color: string; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <span style={{ color: '#fff', fontSize: size * 0.38, fontWeight: 700, lineHeight: 1 }}>
        {initials}
      </span>
    </div>
  );
}

/* ─── Summary card ─────────────────────────────────── */
function SummaryCard({
  icon,
  value,
  label,
  sub,
  color,
  theme,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  sub: string;
  color: string;
  theme: Theme;
}) {
  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minWidth: 0,
        flex: 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: `${color}18`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </div>
        <span style={{ color, fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>
          {value.toLocaleString()}
        </span>
      </div>
      <div>
        <div style={{ color: theme.textPrimary, fontSize: 13, fontWeight: 600 }}>{label}</div>
        <div style={{ color: theme.textTertiary, fontSize: 11 }}>{sub}</div>
      </div>
    </div>
  );
}

/* ─── Expanded team row internals ──────────────────── */
function ExpandedTeamDetails({ team, theme, isMobile }: { team: TeamData; theme: Theme; isMobile?: boolean }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: isMobile ? 20 : 24,
        padding: isMobile ? '16px 16px 20px' : '16px 24px 20px',
        borderTop: `1px solid ${theme.border}`,
        background: theme.surfaceElevated,
      }}
    >
      {/* Left: team members */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Users size={14} color={theme.textTertiary} />
          <span style={{ color: theme.textSecondary, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Team Members
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {team.members.map((m) => (
            <div
              key={m.name}
              style={{
                display: 'grid',
                gridTemplateColumns: '36px 1fr auto auto',
                alignItems: 'center',
                gap: 12,
                padding: '10px 0',
                borderBottom: `1px solid ${theme.border}`,
              }}
            >
              <Avatar initials={m.initials} color={m.color} size={32} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: theme.textPrimary, fontSize: 13, fontWeight: 600 }}>{m.name}</span>
                  {m.isLead && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: '#F5A524',
                        background: 'rgba(245,165,36,0.14)',
                        padding: '2px 6px',
                        borderRadius: 4,
                        letterSpacing: '0.04em',
                      }}
                    >
                      LEAD
                    </span>
                  )}
                </div>
                <span style={{ color: theme.textTertiary, fontSize: 11 }}>{m.role}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ color: theme.textPrimary, fontSize: 13, fontWeight: 700 }}>{m.reviews}</span>
                <div style={{ color: theme.textTertiary, fontSize: 10 }}>reviews</div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 56 }}>
                <span style={{ color: theme.textSecondary, fontSize: 12 }}>{m.avgResponse}</span>
                <div style={{ color: theme.textTertiary, fontSize: 10 }}>avg resp.</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: agents + decision breakdown */}
      <div>
        {/* Agents overseen */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Bot size={14} color={theme.textTertiary} />
          <span style={{ color: theme.textSecondary, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Agents Overseen
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 20 }}>
          {team.agents.map((a) => (
            <div
              key={a.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                background: theme.surface,
                borderRadius: 8,
                border: `1px solid ${theme.border}`,
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: a.status === 'online' ? '#30A46C' : a.status === 'warning' ? '#F5A524' : '#E5484D',
                  flexShrink: 0,
                }}
              />
              <span style={{ color: theme.textPrimary, fontSize: 13, fontWeight: 500 }}>{a.name}</span>
            </div>
          ))}
        </div>

        {/* Decision breakdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Zap size={14} color={theme.textTertiary} />
          <span style={{ color: theme.textSecondary, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Decision Breakdown
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Approved */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#30A46C', display: 'inline-block' }} />
              <span style={{ color: theme.textSecondary, fontSize: 13 }}>Approved</span>
            </div>
            <span style={{ color: theme.textPrimary, fontSize: 14, fontWeight: 700 }}>{team.decisions.approved}</span>
          </div>
          {/* Blocked */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#E5484D', display: 'inline-block' }} />
              <span style={{ color: theme.textSecondary, fontSize: 13 }}>Blocked</span>
            </div>
            <span style={{ color: theme.textPrimary, fontSize: 14, fontWeight: 700 }}>{team.decisions.blocked}</span>
          </div>
          {/* Pending */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#F5A524', display: 'inline-block' }} />
              <span style={{ color: theme.textSecondary, fontSize: 13 }}>Pending</span>
            </div>
            <span style={{ color: theme.textPrimary, fontSize: 14, fontWeight: 700 }}>{team.decisions.pending}</span>
          </div>

          {/* Block rate */}
          <div
            style={{
              marginTop: 4,
              paddingTop: 8,
              borderTop: `1px solid ${theme.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ color: theme.textTertiary, fontSize: 12 }}>Block rate</span>
            <span style={{ color: '#E5484D', fontSize: 14, fontWeight: 700 }}>{team.decisions.blockRate}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══ MAIN COMPONENT ═══════════════════════════════ */
export function OrganisationPage({ theme, isDark, isMobile, onViewTeamAudit, onViewAllAudits, importedTeams, onImportComplete }: OrganisationPageProps) {
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('All departments');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [importModalOpen, setImportModalOpen] = useState(false);

  // Use only CSV-imported teams — page starts empty until import
  const allTeams = useMemo(() => {
    return importedTeams && importedTeams.length > 0 ? importedTeams : [];
  }, [importedTeams]);

  const hasData = allTeams.length > 0;

  // Recompute org summary from combined teams
  const orgSummary = useMemo(() => {
    const teams = allTeams;
    return {
      totalTeams: teams.length,
      totalMembers: teams.reduce((s, t) => s + (t.members.length || t.memberCount), 0),
      aiAgentsGoverned: teams.reduce((s, t) => s + t.agentCount, 0),
      reviews30d: teams.reduce((s, t) => s + t.reviews30d, 0),
      actionsBlocked: teams.reduce((s, t) => s + t.blocked, 0),
      policyViolations: teams.reduce((s, t) => s + t.violations, 0),
      activeIncidents: teams.filter((t) => t.status === 'Active Incident').length,
    };
  }, [allTeams]);

  const departments = useMemo(() => {
    const deps = Array.from(new Set(allTeams.map((t) => t.department)));
    return ['All departments', ...deps];
  }, [allTeams]);

  const statuses = useMemo(() => {
    const sts = Array.from(new Set(allTeams.map((t) => t.status)));
    return ['All statuses', ...sts];
  }, [allTeams]);

  const filteredTeams = useMemo(() => {
    return allTeams.filter((t) => {
      const matchesSearch =
        !searchQuery ||
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.supervisor.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.department.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDept = deptFilter === 'All departments' || t.department === deptFilter;
      const matchesStatus = statusFilter === 'All statuses' || t.status === statusFilter;
      return matchesSearch && matchesDept && matchesStatus;
    });
  }, [allTeams, searchQuery, deptFilter, statusFilter]);

  const toggleExpand = (id: string) => setExpandedTeam((prev) => (prev === id ? null : id));

  const selectBg = isDark ? '#1A1A1A' : '#fff';
  const selectBorder = theme.border;

  return (
    <div>
      {/* ── Breadcrumb + title ──────────────────────── */}
      <div style={{ padding: isMobile ? '14px 0 4px' : '20px 0 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: theme.textTertiary, fontSize: 12 }}>Dashboard</span>
          <span style={{ color: theme.textTertiary, fontSize: 12 }}>/</span>
          <span style={{ color: theme.textSecondary, fontSize: 12, fontWeight: 500 }}>Organisation</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 4 }}>
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
              Organisation Overview
            </h1>
            {!isMobile && (
              <p style={{ color: theme.textSecondary, fontSize: 13, marginTop: 3 }}>
                All teams and their Sentinel governance metrics — who oversees which AI agents, and how they're performing.
              </p>
            )}
          </div>
          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {/* Import CSV button */}
            {onImportComplete && (
              <button
                onClick={() => setImportModalOpen(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: `1px solid ${isDark ? 'rgba(245,165,36,0.3)' : 'rgba(245,165,36,0.4)'}`,
                  background: isDark ? 'rgba(245,165,36,0.1)' : 'rgba(245,165,36,0.08)',
                  color: '#F5A524',
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: 'Inter, sans-serif',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = isDark ? 'rgba(245,165,36,0.2)' : 'rgba(245,165,36,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isDark ? 'rgba(245,165,36,0.1)' : 'rgba(245,165,36,0.08)';
                }}
              >
                <FileSpreadsheet size={14} />
                Import CSV
              </button>
            )}
            {onViewAllAudits && (
              <button
                onClick={onViewAllAudits}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: `1px solid ${isDark ? 'rgba(59,130,246,0.3)' : 'rgba(59,130,246,0.4)'}`,
                  background: isDark ? 'rgba(59,130,246,0.1)' : 'rgba(59,130,246,0.08)',
                  color: '#3B82F6',
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: 'Inter, sans-serif',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = isDark ? 'rgba(59,130,246,0.2)' : 'rgba(59,130,246,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isDark ? 'rgba(59,130,246,0.1)' : 'rgba(59,130,246,0.08)';
                }}
              >
                <ShieldCheck size={14} />
                View All Audits
                <ChevronRight size={14} />
              </button>
            )}
            {orgSummary.activeIncidents > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(229,72,77,0.14)',
                  border: '1px solid rgba(229,72,77,0.3)',
                  borderRadius: 8,
                  padding: '8px 14px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={15} color="#E5484D" />
                <span style={{ color: '#E5484D', fontSize: 13, fontWeight: 600 }}>
                  {orgSummary.activeIncidents} active incident{orgSummary.activeIncidents > 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Summary cards ──────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(6, 1fr)',
          gap: 12,
          marginTop: 12,
        }}
      >
        <SummaryCard icon={<Building2 size={18} color="#3B82F6" />} value={orgSummary.totalTeams} label="Total Teams" sub={hasData ? 'Across all departments' : 'Import CSV to populate'} color="#3B82F6" theme={theme} />
        <SummaryCard icon={<Users size={18} color="#30A46C" />} value={orgSummary.totalMembers} label="Total Members" sub={hasData ? 'Active reviewers' : '—'} color="#30A46C" theme={theme} />
        <SummaryCard icon={<Bot size={18} color="#30A46C" />} value={orgSummary.aiAgentsGoverned} label="AI Agents Governed" sub={hasData ? 'Across all teams' : '—'} color="#30A46C" theme={theme} />
        <SummaryCard icon={<TrendingUp size={18} color="#3B82F6" />} value={orgSummary.reviews30d} label="Reviews (30d)" sub={hasData ? 'Human decisions made' : '—'} color="#3B82F6" theme={theme} />
        <SummaryCard icon={<Ban size={18} color="#E5484D" />} value={orgSummary.actionsBlocked} label="Actions Blocked" sub={hasData ? 'Catastrophes prevented' : '—'} color="#E5484D" theme={theme} />
        <SummaryCard icon={<AlertTriangle size={18} color="#E5484D" />} value={orgSummary.policyViolations} label="Policy Violations" sub={hasData ? 'This month' : '—'} color="#E5484D" theme={theme} />
      </div>

      {/* ── Search + filters ───────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginTop: 20,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: isMobile ? '100%' : 280,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            padding: '8px 12px',
          }}
        >
          <Search size={15} color={theme.textTertiary} />
          <input
            type="text"
            placeholder="Search team, supervisor, or department..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: theme.textPrimary,
              fontSize: 13,
              fontFamily: 'Inter, sans-serif',
            }}
          />
        </div>

        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          style={{
            background: selectBg,
            color: theme.textSecondary,
            border: `1px solid ${selectBorder}`,
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 13,
            fontFamily: 'Inter, sans-serif',
            cursor: 'pointer',
            outline: 'none',
            appearance: 'none',
            WebkitAppearance: 'none',
            paddingRight: 28,
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238A8A8A' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 10px center',
          }}
        >
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            background: selectBg,
            color: theme.textSecondary,
            border: `1px solid ${selectBorder}`,
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 13,
            fontFamily: 'Inter, sans-serif',
            cursor: 'pointer',
            outline: 'none',
            appearance: 'none',
            WebkitAppearance: 'none',
            paddingRight: 28,
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238A8A8A' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 10px center',
          }}
        >
          {statuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <span style={{ color: theme.textTertiary, fontSize: 12, marginLeft: 'auto' }}>
          {filteredTeams.length} teams
        </span>
      </div>

      {/* ── Teams table ────────────────────────── */}
      <div
        style={{
          marginTop: 16,
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 12,
          overflow: 'hidden',
          overflowX: isMobile ? 'hidden' : 'auto',
        }}
      >
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: isMobile ? '10px 16px' : '10px 20px 10px 28px', ...(isMobile ? {} : { minWidth: 1520 }) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Building2 size={14} color={theme.textTertiary} />
            <span style={{ color: theme.textPrimary, fontSize: 14, fontWeight: 700 }}>Teams</span>
            <span
              style={{
                background: isDark ? '#262626' : '#EFEFEF',
                color: theme.textSecondary,
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 999,
              }}
            >
              {filteredTeams.length}
            </span>
          </div>
          <span style={{ color: theme.textTertiary, fontSize: 11, marginLeft: 'auto' }}>
            {isMobile ? 'Tap to expand' : 'Click a row to expand'}
          </span>
        </div>

        {/* Column headers — desktop only */}
        {!isMobile && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '200px 156px 88px 124px 100px 108px 80px 144px 116px 88px 92px 36px',
            columnGap: 16,
            alignItems: 'center',
            padding: '10px 28px',
            background: theme.tableHeaderBg,
            borderTop: `1px solid ${theme.border}`,
            borderBottom: `1px solid ${theme.border}`,
            minWidth: 1520,
          }}
        >
          {['TEAM', 'SUPERVISOR', 'MEMBERS', 'STATUS', 'AGENTS', 'REVIEWS (30D)', 'BLOCKED', 'AVG RISK SCORE', 'AVG RESPONSE', 'VIOLATIONS', 'LAST ACTIVE', ''].map((h) => (
            <span key={h} style={{ color: theme.textTertiary, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {h}
            </span>
          ))}
        </div>
        )}

        {/* Mobile column headers */}
        {isMobile && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              padding: '8px 16px',
              background: theme.tableHeaderBg,
              borderTop: `1px solid ${theme.border}`,
              borderBottom: `1px solid ${theme.border}`,
            }}
          >
            <span style={{ color: theme.textTertiary, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>TEAM</span>
            <span style={{ color: theme.textTertiary, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'right' }}>SUPERVISOR</span>
          </div>
        )}

        {/* Empty state */}
        {filteredTeams.length === 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '48px 24px',
              gap: 12,
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: isDark ? 'rgba(245,165,36,0.08)' : 'rgba(245,165,36,0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FileSpreadsheet size={26} color="#F5A524" />
            </div>
            <h3 style={{ color: theme.textPrimary, fontSize: 16, fontWeight: 700, margin: 0 }}>
              No organisation data yet
            </h3>
            <p style={{ color: theme.textTertiary, fontSize: 13, margin: 0, textAlign: 'center', maxWidth: 340 }}>
              Import a CSV file to populate teams, members, agents, and audit trails.
            </p>
            {onImportComplete && (
              <button
                onClick={() => setImportModalOpen(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 8,
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#F5A524',
                  color: '#000',
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: 'Inter, sans-serif',
                  cursor: 'pointer',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
              >
                <FileSpreadsheet size={15} />
                Import Organisation CSV
              </button>
            )}
          </div>
        )}

        {/* Data rows */}
        {filteredTeams.map((team) => {
          const isExpanded = expandedTeam === team.id;
          const st = statusStyles[team.status];
          const rc = riskColor(team.avgRiskScore);

          return (
            <div key={team.id}>
              {/* ─── Mobile card row ─── */}
              {isMobile ? (
                <div
                  onClick={() => toggleExpand(team.id)}
                  style={{
                    padding: '14px 16px',
                    borderBottom: `1px solid ${theme.border}`,
                    cursor: 'pointer',
                    background: isExpanded ? theme.surfaceElevated : 'transparent',
                    borderLeft: team.status === 'Elevated Risk' || team.status === 'Active Incident'
                      ? `3px solid ${st.color}`
                      : '3px solid transparent',
                  }}
                >
                  {/* Top: team name + supervisor + chevron */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: theme.textPrimary, fontSize: 14, fontWeight: 600 }}>{team.name}</div>
                      <div style={{ color: theme.textTertiary, fontSize: 11, marginTop: 2 }}>{team.department}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <Avatar initials={team.supervisor.initials} color={team.supervisor.color} size={26} />
                      <div>
                        <div style={{ color: theme.textPrimary, fontSize: 12, fontWeight: 600 }}>{team.supervisor.name}</div>
                        <div style={{ color: theme.textTertiary, fontSize: 10 }}>{team.supervisor.role}</div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp size={16} color={theme.textTertiary} />
                      ) : (
                        <ChevronDown size={16} color={theme.textTertiary} />
                      )}
                    </div>
                  </div>

                  {/* Status + members row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                    {/* Status badge */}
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        background: st.bg,
                        padding: '3px 10px',
                        borderRadius: 999,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />
                      <span style={{ color: st.color, fontSize: 11, fontWeight: 600 }}>{team.status}</span>
                    </div>

                    {/* Members */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Users size={12} color={theme.textTertiary} />
                      <span style={{ color: theme.textSecondary, fontSize: 11 }}>{team.memberCount}</span>
                    </div>

                    {/* Agents */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Bot size={12} color={theme.textTertiary} />
                      <span style={{ color: theme.textSecondary, fontSize: 11 }}>
                        {team.agentCount} agent{team.agentCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  {/* Metrics row */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: 8,
                      marginTop: 12,
                      padding: '10px 12px',
                      background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                      borderRadius: 8,
                    }}
                  >
                    <div>
                      <div style={{ color: theme.textTertiary, fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Reviews</div>
                      <div style={{ color: theme.textPrimary, fontSize: 14, fontWeight: 700, marginTop: 2 }}>{team.reviews30d}</div>
                    </div>
                    <div>
                      <div style={{ color: theme.textTertiary, fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Blocked</div>
                      <div style={{ color: '#E5484D', fontSize: 14, fontWeight: 700, marginTop: 2 }}>{team.blocked}</div>
                    </div>
                    <div>
                      <div style={{ color: theme.textTertiary, fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Risk</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <div style={{ width: 32, height: 4, borderRadius: 2, background: isDark ? '#222' : '#E0E0E0', overflow: 'hidden' }}>
                          <div style={{ width: `${team.avgRiskScore}%`, height: '100%', borderRadius: 2, background: rc }} />
                        </div>
                        <span style={{ color: theme.textPrimary, fontSize: 12, fontWeight: 700 }}>{team.avgRiskScore}</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ color: theme.textTertiary, fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Violations</div>
                      <div style={{ color: team.violations > 0 ? '#E5484D' : '#30A46C', fontSize: 14, fontWeight: 700, marginTop: 2 }}>{team.violations}</div>
                    </div>
                  </div>

                  {/* Avg Response + Last Active */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                    <span style={{ color: theme.textSecondary, fontSize: 11 }}>⏱ {team.avgResponse}</span>
                    <span style={{ color: theme.textTertiary, fontSize: 11 }}>{team.lastActive}</span>
                  </div>
                </div>
              ) : (
              /* ─── Desktop grid row ─── */
              <div
                onClick={() => toggleExpand(team.id)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '200px 156px 88px 124px 100px 108px 80px 144px 116px 88px 92px 36px',
                  columnGap: 16,
                  alignItems: 'center',
                  padding: '14px 28px',
                  borderBottom: `1px solid ${theme.border}`,
                  cursor: 'pointer',
                  transition: 'background 0.12s',
                  background: isExpanded ? theme.surfaceElevated : 'transparent',
                  borderLeft: team.status === 'Elevated Risk' || team.status === 'Active Incident'
                    ? `3px solid ${st.color}`
                    : '3px solid transparent',
                }}
                onMouseEnter={(e) => {
                  if (!isExpanded) e.currentTarget.style.background = theme.rowHover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isExpanded ? theme.surfaceElevated : 'transparent';
                }}
              >
                {/* Team name + department */}
                <div>
                  <div style={{ color: theme.textPrimary, fontSize: 13, fontWeight: 600 }}>{team.name}</div>
                  <div style={{ color: theme.textTertiary, fontSize: 11 }}>{team.department}</div>
                </div>

                {/* Supervisor */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar initials={team.supervisor.initials} color={team.supervisor.color} size={26} />
                  <div>
                    <div style={{ color: theme.textPrimary, fontSize: 12, fontWeight: 600 }}>{team.supervisor.name}</div>
                    <div style={{ color: theme.textTertiary, fontSize: 10 }}>{team.supervisor.role}</div>
                  </div>
                </div>

                {/* Members (avatar stack + count) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ display: 'flex' }}>
                    {team.memberAvatars.slice(0, 4).map((a, i) => (
                      <div
                        key={i}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: a.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginLeft: i > 0 ? -6 : 0,
                          border: `2px solid ${theme.surface}`,
                          zIndex: 4 - i,
                          position: 'relative',
                        }}
                      >
                        <span style={{ color: '#fff', fontSize: 8, fontWeight: 700 }}>{a.initials}</span>
                      </div>
                    ))}
                    {team.memberCount > 4 && (
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: isDark ? '#333' : '#ddd',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginLeft: -6,
                          border: `2px solid ${theme.surface}`,
                          position: 'relative',
                        }}
                      >
                        <span style={{ color: theme.textSecondary, fontSize: 8, fontWeight: 700 }}>
                          +{team.memberCount - 4}
                        </span>
                      </div>
                    )}
                  </div>
                  <span style={{ color: theme.textSecondary, fontSize: 12, fontWeight: 600, marginLeft: 4 }}>
                    {team.memberCount}
                  </span>
                </div>

                {/* Status */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    background: st.bg,
                    padding: '4px 10px',
                    borderRadius: 999,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />
                  <span style={{ color: st.color, fontSize: 11, fontWeight: 600 }}>{team.status}</span>
                </div>

                {/* Agents */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Bot size={13} color={theme.textTertiary} />
                  <span style={{ color: theme.textSecondary, fontSize: 12 }}>
                    {team.agentCount} agent{team.agentCount !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Reviews 30d */}
                <div>
                  <span style={{ color: theme.textPrimary, fontSize: 13, fontWeight: 700 }}>{team.reviews30d}</span>
                  <div style={{ color: theme.textTertiary, fontSize: 10 }}>last 30 days</div>
                </div>

                {/* Blocked */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Ban size={12} color="#E5484D" />
                  <span style={{ color: '#E5484D', fontSize: 13, fontWeight: 700 }}>{team.blocked}</span>
                </div>

                {/* Avg Risk Score */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 60,
                      height: 6,
                      borderRadius: 3,
                      background: isDark ? '#222' : '#E0E0E0',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${team.avgRiskScore}%`,
                        height: '100%',
                        borderRadius: 3,
                        background: rc,
                      }}
                    />
                  </div>
                  <span style={{ color: theme.textPrimary, fontSize: 12, fontWeight: 700 }}>{team.avgRiskScore}</span>
                </div>

                {/* Avg Response */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ color: theme.textSecondary, fontSize: 12 }}>⏱ {team.avgResponse}</span>
                </div>

                {/* Violations */}
                <span
                  style={{
                    color: team.violations > 0 ? '#E5484D' : '#30A46C',
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {team.violations}
                </span>

                {/* Last Active */}
                <span style={{ color: theme.textTertiary, fontSize: 12 }}>{team.lastActive}</span>

                {/* Chevron */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isExpanded ? (
                    <ChevronUp size={16} color={theme.textTertiary} />
                  ) : (
                    <ChevronDown size={16} color={theme.textTertiary} />
                  )}
                </div>
              </div>
              )}

              {/* Expanded details panel */}
              {isExpanded && (
                <>
                  <ExpandedTeamDetails team={team} theme={theme} isMobile={isMobile} />
                  {onViewTeamAudit && (
                    <div
                      style={{
                        padding: isMobile ? '10px 16px 14px' : '10px 28px 14px',
                        borderBottom: `1px solid ${theme.border}`,
                        background: theme.surfaceElevated,
                        display: 'flex',
                        justifyContent: 'flex-end',
                      }}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewTeamAudit(team.id, team.name);
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '8px 16px',
                          borderRadius: 8,
                          border: `1px solid ${isDark ? 'rgba(48,164,108,0.3)' : 'rgba(48,164,108,0.4)'}`,
                          background: isDark ? 'rgba(48,164,108,0.1)' : 'rgba(48,164,108,0.08)',
                          color: '#30A46C',
                          fontSize: 12,
                          fontWeight: 600,
                          fontFamily: 'Inter, sans-serif',
                          cursor: 'pointer',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = isDark ? 'rgba(48,164,108,0.2)' : 'rgba(48,164,108,0.15)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = isDark ? 'rgba(48,164,108,0.1)' : 'rgba(48,164,108,0.08)';
                        }}
                      >
                        View Audit Trail
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
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
          Sentinel v2.4.1 · Organisation governance view
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Zap size={13} color="#F5A524" />
          <span style={{ color: hasData ? '#E5484D' : theme.textTertiary, fontSize: 12, fontWeight: 600 }}>
            {hasData ? `${orgSummary.actionsBlocked} catastrophic actions blocked across all teams` : 'Awaiting organisation data import'}
          </span>
        </div>
      </div>

      {/* CSV Import Modal */}
      {onImportComplete && (
        <CsvImportModal
          theme={theme}
          isDark={isDark}
          isMobile={isMobile}
          isOpen={importModalOpen}
          onClose={() => setImportModalOpen(false)}
          onImportComplete={onImportComplete}
        />
      )}
    </div>
  );
}
