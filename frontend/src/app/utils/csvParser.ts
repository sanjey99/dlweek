/**
 * CSV Parser for Sentinel Organisation data imports.
 * Single unified CSV format with a `row_type` column: team | member | agent | audit
 */

import type { TeamData, TeamMember, AgentOverseen, DecisionBreakdown, TeamStatus } from '../data/organisationData';
import type { ActionItem, RiskStatus } from '../types';

/* ─── Generic CSV parsing ──────────────────────────────────────────────────── */

/** Parse CSV text into an array of row objects keyed by header names */
export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] || '').trim();
    });
    rows.push(row);
  }

  return rows;
}

/** Parse a single CSV line respecting quoted fields */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++; // skip next quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

/* ─── Row types ────────────────────────────────────────────────────────────── */

export type RowType = 'team' | 'member' | 'agent' | 'audit';

/* ─── Color palette for auto-assigning ─────────────────────────────────────── */

const AVATAR_COLORS = [
  '#30A46C', '#E5484D', '#F5A524', '#3B82F6', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#14B8A6', '#84CC16',
  '#F43F5E', '#A855F7', '#22D3EE', '#E879F9', '#10B981',
  '#6366F1', '#F59E0B', '#EF4444',
];

const DEPT_COLORS: Record<string, string> = {
  Engineering: '#3B82F6',
  Security: '#E5484D',
  'AI Research': '#8B5CF6',
  Operations: '#F59E0B',
  DevOps: '#06B6D4',
  Infrastructure: '#14B8A6',
  Data: '#84CC16',
  Compliance: '#EC4899',
};

function pickColor(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

function deptColor(dept: string): string {
  return DEPT_COLORS[dept] || AVATAR_COLORS[dept.length % AVATAR_COLORS.length];
}

function generateInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/* ─── Parsed intermediate types ────────────────────────────────────────────── */

export interface ParsedTeam {
  id: string;
  name: string;
  department: string;
  departmentColor: string;
  supervisorName: string;
  supervisorInitials: string;
  supervisorColor: string;
  supervisorRole: string;
  status: TeamStatus;
  reviews30d: number;
  blocked: number;
  avgRiskScore: number;
  avgResponse: string;
  violations: number;
  lastActive: string;
}

interface ParsedMember {
  teamId: string;
  name: string;
  initials: string;
  color: string;
  role: string;
  isLead: boolean;
  reviews: number;
  avgResponse: string;
}

interface ParsedAgent {
  teamId: string;
  name: string;
  status: 'online' | 'warning' | 'offline';
}

export interface ParsedAuditEvent {
  id: string;
  timestamp: string;
  agentName: string;
  proposedAction: string;
  user: string;
  environment: 'PROD' | 'STAGING';
  riskScore: number;
  riskStatus: RiskStatus;
  flagReasons: string[];
  source: string;
  teamId: string;
  reviewer: string;
  duration: string;
}

const VALID_STATUSES: TeamStatus[] = ['Operational', 'Elevated Risk', 'Under Review', 'Active Incident'];
const VALID_RISK_STATUSES: RiskStatus[] = [
  'HIGH_RISK_PENDING', 'HIGH_RISK_BLOCKED', 'MEDIUM_RISK_PENDING',
  'LOW_RISK', 'APPROVED', 'ESCALATED',
];

/* ─── Unified CSV parse result ─────────────────────────────────────────────── */

export interface OrgCsvParseResult {
  teams: ParsedTeam[];
  members: ParsedMember[];
  agents: ParsedAgent[];
  auditEvents: ParsedAuditEvent[];
  counts: { teams: number; members: number; agents: number; audit: number };
}

/**
 * Parse a unified organisation CSV.
 * The CSV must have a `row_type` column with values: team | member | agent | audit.
 * Each row type uses a subset of the columns; unused columns are left empty.
 */
export function parseOrganisationCsv(rows: Record<string, string>[]): OrgCsvParseResult {
  const teams: ParsedTeam[] = [];
  const members: ParsedMember[] = [];
  const agents: ParsedAgent[] = [];
  const auditEvents: ParsedAuditEvent[] = [];

  let teamIdx = 0;
  let memberIdx = 0;
  let agentIdx = 0;
  let auditIdx = 0;

  for (const r of rows) {
    const rowType = (r.row_type || r.type || '').toLowerCase().trim();
    switch (rowType) {
      case 'team': {
        const id = r.team_id || r.teamid || `team-imported-${++teamIdx}`;
        const name = r.name || r.team_name || `Team ${teamIdx}`;
        const department = r.department || r.dept || 'General';
        const supervisorName = r.supervisor_name || r.supervisor || '';
        const rawStatus = r.team_status || r.status || 'Operational';
        const status: TeamStatus = VALID_STATUSES.includes(rawStatus as TeamStatus)
          ? (rawStatus as TeamStatus)
          : 'Operational';

        teams.push({
          id,
          name,
          department,
          departmentColor: r.department_color || deptColor(department),
          supervisorName,
          supervisorInitials: r.supervisor_initials || generateInitials(supervisorName || name),
          supervisorColor: r.supervisor_color || pickColor(teamIdx),
          supervisorRole: r.supervisor_role || 'Team Lead',
          status,
          reviews30d: parseInt(r.reviews_30d || '0', 10) || 0,
          blocked: parseInt(r.blocked || '0', 10) || 0,
          avgRiskScore: parseInt(r.avg_risk_score || '0', 10) || 0,
          avgResponse: r.avg_response || '—',
          violations: parseInt(r.violations || '0', 10) || 0,
          lastActive: r.last_active || 'recently',
        });
        teamIdx = teams.length;
        break;
      }

      case 'member': {
        memberIdx++;
        const memberName = r.name || `Member ${memberIdx}`;
        members.push({
          teamId: r.team_id || r.teamid || '',
          name: memberName,
          initials: r.initials || generateInitials(memberName),
          color: r.color || pickColor(memberIdx),
          role: r.role || 'Member',
          isLead: ['true', '1', 'yes'].includes((r.is_lead || r.islead || '').toLowerCase()),
          reviews: parseInt(r.reviews || '0', 10) || 0,
          avgResponse: r.avg_response || '—',
        });
        break;
      }

      case 'agent': {
        agentIdx++;
        const rawAgentStatus = (r.agent_status || r.status || 'online').toLowerCase();
        const agentStatus: 'online' | 'warning' | 'offline' =
          rawAgentStatus === 'warning' ? 'warning' : rawAgentStatus === 'offline' ? 'offline' : 'online';
        agents.push({
          teamId: r.team_id || r.teamid || '',
          name: r.name || r.agent_name || `agent-${agentIdx}`,
          status: agentStatus,
        });
        break;
      }

      case 'audit': {
        auditIdx++;
        const rawEnv = (r.environment || r.env || 'PROD').toUpperCase();
        const environment: 'PROD' | 'STAGING' = rawEnv === 'STAGING' ? 'STAGING' : 'PROD';

        const rawRiskStatus = r.risk_status || r.decision || 'APPROVED';
        const riskStatus: RiskStatus = VALID_RISK_STATUSES.includes(rawRiskStatus as RiskStatus)
          ? (rawRiskStatus as RiskStatus)
          : mapDecisionToRiskStatus(rawRiskStatus);

        const flagStr = r.flag_reasons || r.flags || '';
        const flagReasons = flagStr ? flagStr.split('|').map((s) => s.trim()).filter(Boolean) : [];

        auditEvents.push({
          id: r.event_id || r.eventid || `AUD-IMP-${String(auditIdx).padStart(3, '0')}`,
          timestamp: r.timestamp || r.time || new Date().toISOString(),
          agentName: r.agent_name || r.name || 'unknown-agent',
          proposedAction: r.command || r.proposed_action || r.action || '',
          user: r.user || '',
          environment,
          riskScore: parseInt(r.risk_score || '0', 10) || 0,
          riskStatus,
          flagReasons,
          source: r.source || 'csv-import',
          teamId: r.team_id || r.teamid || '',
          reviewer: r.reviewer || '',
          duration: r.duration || '',
        });
        break;
      }

      default:
        // Skip rows without a valid row_type (or treat as comment)
        break;
    }
  }

  return {
    teams,
    members,
    agents,
    auditEvents,
    counts: { teams: teams.length, members: members.length, agents: agents.length, audit: auditEvents.length },
  };
}

/** Validate that a CSV has the required row_type column */
export function validateOrgCsv(headers: string[]): { valid: boolean; error?: string } {
  const h = new Set(headers.map((s) => s.toLowerCase().replace(/\s+/g, '_')));
  if (!h.has('row_type') && !h.has('type')) {
    return { valid: false, error: 'CSV must have a "row_type" column (values: team, member, agent, audit).' };
  }
  if (!h.has('team_id') && !h.has('teamid')) {
    return { valid: false, error: 'CSV must have a "team_id" column to link rows to teams.' };
  }
  return { valid: true };
}

function mapDecisionToRiskStatus(decision: string): RiskStatus {
  const d = decision.toLowerCase().trim();
  if (d === 'approved') return 'APPROVED';
  if (d === 'auto-approved' || d === 'auto_approved') return 'LOW_RISK';
  if (d === 'blocked') return 'HIGH_RISK_BLOCKED';
  if (d === 'pending') return 'HIGH_RISK_PENDING';
  if (d === 'escalated') return 'ESCALATED';
  return 'APPROVED';
}

/* ─── Assemble TeamData[] from parsed CSV parts ────────────────────────────── */

export function assembleTeamsFromCsv(result: OrgCsvParseResult): TeamData[] {
  const { teams, members, agents, auditEvents } = result;

  return teams.map((t) => {
    const teamMembers: TeamMember[] = members
      .filter((m) => m.teamId === t.id)
      .map((m) => ({
        name: m.name,
        initials: m.initials,
        color: m.color,
        role: m.role,
        isLead: m.isLead,
        reviews: m.reviews,
        avgResponse: m.avgResponse,
      }));

    const teamAgents: AgentOverseen[] = agents
      .filter((a) => a.teamId === t.id)
      .map((a) => ({
        name: a.name,
        status: a.status,
      }));

    // Calculate decisions from audit events for this team
    const teamEvents = auditEvents.filter((e) => e.teamId === t.id);
    const approved = teamEvents.filter((e) => e.riskStatus === 'APPROVED').length;
    const autoApproved = teamEvents.filter((e) => e.riskStatus === 'LOW_RISK').length;
    const blocked = teamEvents.filter(
      (e) => e.riskStatus === 'HIGH_RISK_BLOCKED' || e.riskStatus === 'ESCALATED'
    ).length;
    const pending = teamEvents.filter(
      (e) => e.riskStatus === 'HIGH_RISK_PENDING' || e.riskStatus === 'MEDIUM_RISK_PENDING'
    ).length;
    const totalDecisions = approved + autoApproved + blocked + pending;
    const blockRate = totalDecisions > 0 ? `${Math.round((blocked / totalDecisions) * 100)}%` : '0%';

    // Compute stats from events when available (always prefer event-derived data)
    const computedReviews = teamEvents.length;
    const computedBlocked = blocked;
    const computedViolations = teamEvents.filter(
      (e) => e.riskScore >= 70
    ).length;
    const computedAvgRisk = teamEvents.length > 0
      ? Math.round(teamEvents.reduce((s, e) => s + e.riskScore, 0) / teamEvents.length)
      : 0;

    const finalReviews = computedReviews > 0 ? computedReviews : t.reviews30d;
    const finalBlocked = computedReviews > 0 ? computedBlocked : t.blocked;
    const finalViolations = computedReviews > 0 ? computedViolations : t.violations;
    const finalAvgRisk = computedReviews > 0 ? computedAvgRisk : t.avgRiskScore;

    const decisions: DecisionBreakdown = teamEvents.length > 0
      ? { approved: approved + autoApproved, blocked, pending, blockRate }
      : { approved: 0, blocked: finalBlocked, pending: 0, blockRate: finalBlocked > 0 ? `${Math.round((finalBlocked / Math.max(1, t.reviews30d)) * 100)}%` : '0%' };

    const memberAvatars = teamMembers.slice(0, 4).map((m) => ({
      initials: m.initials,
      color: m.color,
    }));

    return {
      id: t.id,
      name: t.name,
      department: t.department,
      departmentColor: t.departmentColor,
      supervisor: {
        name: t.supervisorName,
        initials: t.supervisorInitials,
        color: t.supervisorColor,
        role: t.supervisorRole,
      },
      members: teamMembers,
      memberAvatars,
      memberCount: teamMembers.length || members.filter((m) => m.teamId === t.id).length,
      status: t.status,
      agentCount: teamAgents.length,
      reviews30d: finalReviews,
      blocked: finalBlocked,
      avgRiskScore: finalAvgRisk,
      avgResponse: t.avgResponse,
      violations: finalViolations,
      lastActive: t.lastActive,
      agents: teamAgents,
      decisions,
    };
  });
}

/* ─── Convert ParsedAuditEvent[] → ActionItem[] ───────────────────────────── */

export function auditEventsToActionItems(events: ParsedAuditEvent[]): ActionItem[] {
  return events.map((e) => ({
    id: e.id,
    timestamp: e.timestamp,
    agentName: e.agentName,
    proposedAction: e.proposedAction,
    environment: e.environment,
    riskStatus: e.riskStatus,
    riskScore: e.riskScore,
    flagReasons: e.flagReasons,
    source: e.source,
    user: e.user,
    reviewer: e.reviewer,
    duration: e.duration,
  }));
}

/* ─── Generate sample CSV template ─────────────────────────────────────────── */

export function getOrganisationCsvTemplate(): string {
  return `row_type,team_id,name,department,department_color,supervisor_name,supervisor_role,team_status,reviews_30d,blocked,avg_risk_score,avg_response,violations,last_active,role,is_lead,reviews,initials,color,agent_status,event_id,timestamp,agent_name,command,user,environment,risk_score,risk_status,flag_reasons,source,reviewer,duration
team,team-example,Example Team,Engineering,#3B82F6,Jane Doe,Team Lead,Operational,120,15,45,3m 30s,2,2h ago,,,,,,,,,,,,,,,,
member,team-example,Jane Doe,,,,,,,,,,,,Engineering Manager,true,48,JD,#30A46C,,,,,,,,,,,
member,team-example,John Smith,,,,,,,,,,,,Senior Engineer,false,32,JS,#E5484D,,,,,,,,,,,
agent,team-example,agent-deploy,,,,,,,,,,,,,,,,,,online,,,,,,,,,,
agent,team-example,agent-monitor,,,,,,,,,,,,,,,,,,warning,,,,,,,,,,
audit,team-example,,,,,,,,,,,,,,,,,,,,,AUD-2026-001,2026-03-01T14:32:05Z,agent-deploy,"kubectl scale deployment api --replicas=5",Jane Doe,PROD,72,HIGH_RISK_PENDING,production|scale-up,ml-ensemble,,
audit,team-example,,,,,,,,,,,,,,,,,,,,,AUD-2026-002,2026-03-01T14:28:12Z,agent-monitor,restart alertmanager service,John Smith,STAGING,25,APPROVED,,rule-engine,Jane Doe,2m 15s`;
}
