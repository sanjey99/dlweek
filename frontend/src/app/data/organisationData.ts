/**
 * Mock data for Organisation Overview page.
 * Matches the Figma design exactly.
 */

export interface TeamMember {
  name: string;
  initials: string;
  color: string;
  role: string;
  isLead?: boolean;
  reviews: number;
  avgResponse: string;
}

export interface AgentOverseen {
  name: string;
  status: 'online' | 'warning' | 'offline';
}

export interface DecisionBreakdown {
  approved: number;
  blocked: number;
  pending: number;
  blockRate: string;
}

export type TeamStatus = 'Operational' | 'Elevated Risk' | 'Under Review' | 'Active Incident';

export interface TeamData {
  id: string;
  name: string;
  department: string;
  departmentColor: string;
  supervisor: { name: string; initials: string; color: string; role: string };
  members: TeamMember[];
  memberAvatars: { initials: string; color: string }[];
  memberCount: number;
  status: TeamStatus;
  agentCount: number;
  reviews30d: number;
  blocked: number;
  avgRiskScore: number;
  avgResponse: string;
  violations: number;
  lastActive: string;
  agents: AgentOverseen[];
  decisions: DecisionBreakdown;
}

export const orgSummary = {
  totalTeams: 6,
  totalMembers: 27,
  aiAgentsGoverned: 10,
  reviews30d: 739,
  actionsBlocked: 147,
  policyViolations: 24,
  activeIncidents: 1,
};

export const teamsData: TeamData[] = [
  {
    id: 'team-core-infra',
    name: 'Core Infrastructure',
    department: 'Engineering',
    departmentColor: '#3B82F6',
    supervisor: { name: 'Alex Kim', initials: 'AK', color: '#30A46C', role: 'Team Lead' },
    memberAvatars: [
      { initials: 'AK', color: '#30A46C' },
      { initials: 'DO', color: '#E5484D' },
      { initials: 'YT', color: '#F5A524' },
      { initials: 'LB', color: '#3B82F6' },
    ],
    memberCount: 6,
    status: 'Operational',
    agentCount: 3,
    reviews30d: 161,
    blocked: 22,
    avgRiskScore: 61,
    avgResponse: '4m 32s',
    violations: 4,
    lastActive: '4h ago',
    members: [
      { name: 'Alex Kim', initials: 'AK', color: '#30A46C', role: 'Engineering Manager', isLead: true, reviews: 48, avgResponse: '3m 12s' },
      { name: 'Dan Osei', initials: 'DO', color: '#E5484D', role: 'Senior SRE', reviews: 31, avgResponse: '4m 55s' },
      { name: 'Yuki Tanaka', initials: 'YT', color: '#F5A524', role: 'Platform Engineer', reviews: 27, avgResponse: '5m 08s' },
      { name: 'Lena Braun', initials: 'LB', color: '#3B82F6', role: 'SRE', reviews: 22, avgResponse: '6m 01s' },
      { name: 'Ravi Mehta', initials: 'RM', color: '#8B5CF6', role: 'DevOps Engineer', reviews: 19, avgResponse: '5m 44s' },
      { name: 'Chloe Martin', initials: 'CM', color: '#EC4899', role: 'Infra Analyst', reviews: 14, avgResponse: '7m 22s' },
    ],
    agents: [
      { name: 'agent-infra-ops', status: 'online' },
      { name: 'agent-ci-cd', status: 'online' },
      { name: 'agent-monitor', status: 'online' },
    ],
    decisions: { approved: 117, blocked: 22, pending: 3, blockRate: '14%' },
  },
  {
    id: 'team-db-ops',
    name: 'Database Operations',
    department: 'Engineering',
    departmentColor: '#3B82F6',
    supervisor: { name: 'Marcus Chen', initials: 'MC', color: '#8B5CF6', role: 'Team Lead' },
    memberAvatars: [
      { initials: 'MC', color: '#8B5CF6' },
      { initials: 'AD', color: '#F97316' },
      { initials: 'TN', color: '#06B6D4' },
      { initials: 'PS', color: '#EF4444' },
    ],
    memberCount: 4,
    status: 'Elevated Risk',
    agentCount: 2,
    reviews30d: 135,
    blocked: 31,
    avgRiskScore: 74,
    avgResponse: '5m 58s',
    violations: 9,
    lastActive: '4h ago',
    members: [
      { name: 'Marcus Chen', initials: 'MC', color: '#8B5CF6', role: 'Database Lead', isLead: true, reviews: 52, avgResponse: '4m 30s' },
      { name: 'Amara Diallo', initials: 'AD', color: '#F97316', role: 'DBA Senior', reviews: 38, avgResponse: '5m 12s' },
      { name: 'Tomas Novak', initials: 'TN', color: '#06B6D4', role: 'DB Engineer', reviews: 28, avgResponse: '6m 45s' },
      { name: 'Preethi Sharma', initials: 'PS', color: '#EF4444', role: 'DB Analyst', reviews: 17, avgResponse: '7m 20s' },
    ],
    agents: [
      { name: 'agent-db-ops', status: 'warning' },
      { name: 'agent-db-backup', status: 'online' },
    ],
    decisions: { approved: 89, blocked: 31, pending: 5, blockRate: '23%' },
  },
  {
    id: 'team-sec-comp',
    name: 'Security & Compliance',
    department: 'Security',
    departmentColor: '#E5484D',
    supervisor: { name: 'Priya Patel', initials: 'PP', color: '#EC4899', role: 'Team Lead' },
    memberAvatars: [
      { initials: 'PP', color: '#EC4899' },
      { initials: 'JO', color: '#F59E0B' },
      { initials: 'NK', color: '#10B981' },
      { initials: 'ST', color: '#6366F1' },
    ],
    memberCount: 5,
    status: 'Operational',
    agentCount: 2,
    reviews30d: 209,
    blocked: 58,
    avgRiskScore: 82,
    avgResponse: '3m 1s',
    violations: 1,
    lastActive: '4h ago',
    members: [
      { name: 'Priya Patel', initials: 'PP', color: '#EC4899', role: 'Security Lead', isLead: true, reviews: 67, avgResponse: '2m 15s' },
      { name: 'James Okonjo', initials: 'JO', color: '#F59E0B', role: 'Security Analyst', reviews: 52, avgResponse: '3m 05s' },
      { name: 'Nina Kowalski', initials: 'NK', color: '#10B981', role: 'Compliance Officer', reviews: 41, avgResponse: '3m 22s' },
      { name: 'Sam Torres', initials: 'ST', color: '#6366F1', role: 'Security Engineer', reviews: 31, avgResponse: '3m 55s' },
      { name: 'Kai Nakamura', initials: 'KN', color: '#F97316', role: 'Compliance Analyst', reviews: 18, avgResponse: '4m 10s' },
    ],
    agents: [
      { name: 'agent-sec-scan', status: 'online' },
      { name: 'agent-compliance', status: 'online' },
    ],
    decisions: { approved: 138, blocked: 58, pending: 4, blockRate: '28%' },
  },
  {
    id: 'team-ml-ds',
    name: 'ML & Data Science',
    department: 'AI Research',
    departmentColor: '#8B5CF6',
    supervisor: { name: 'Sarah Jones', initials: 'SJ', color: '#06B6D4', role: 'Team Lead' },
    memberAvatars: [
      { initials: 'SJ', color: '#06B6D4' },
      { initials: 'LF', color: '#84CC16' },
      { initials: 'AQ', color: '#F43F5E' },
      { initials: 'JP', color: '#A855F7' },
    ],
    memberCount: 5,
    status: 'Under Review',
    agentCount: 2,
    reviews30d: 125,
    blocked: 14,
    avgRiskScore: 43,
    avgResponse: '7m 41s',
    violations: 3,
    lastActive: '4h ago',
    members: [
      { name: 'Sarah Jones', initials: 'SJ', color: '#06B6D4', role: 'ML Team Lead', isLead: true, reviews: 38, avgResponse: '6m 20s' },
      { name: 'Leo Fischer', initials: 'LF', color: '#84CC16', role: 'Data Scientist', reviews: 29, avgResponse: '7m 10s' },
      { name: 'Ava Quinn', initials: 'AQ', color: '#F43F5E', role: 'ML Engineer', reviews: 24, avgResponse: '8m 05s' },
      { name: 'Jay Park', initials: 'JP', color: '#A855F7', role: 'Research Engineer', reviews: 20, avgResponse: '8m 45s' },
      { name: 'Mila Rossi', initials: 'MR', color: '#F97316', role: 'Data Analyst', reviews: 14, avgResponse: '9m 12s' },
    ],
    agents: [
      { name: 'agent-ml-train', status: 'online' },
      { name: 'agent-data-pipeline', status: 'online' },
    ],
    decisions: { approved: 98, blocked: 14, pending: 6, blockRate: '11%' },
  },
  {
    id: 'team-file-storage',
    name: 'File & Storage Ops',
    department: 'Engineering',
    departmentColor: '#3B82F6',
    supervisor: { name: 'Dan Osei', initials: 'DO', color: '#E5484D', role: 'Team Lead' },
    memberAvatars: [
      { initials: 'DO', color: '#E5484D' },
      { initials: 'CW', color: '#14B8A6' },
      { initials: 'OS', color: '#F59E0B' },
    ],
    memberCount: 3,
    status: 'Active Incident',
    agentCount: 1,
    reviews30d: 57,
    blocked: 18,
    avgRiskScore: 57,
    avgResponse: '6m 35s',
    violations: 7,
    lastActive: '4h ago',
    members: [
      { name: 'Dan Osei', initials: 'DO', color: '#E5484D', role: 'Storage Lead', isLead: true, reviews: 24, avgResponse: '5m 10s' },
      { name: 'Clara Wright', initials: 'CW', color: '#14B8A6', role: 'Storage Engineer', reviews: 19, avgResponse: '7m 02s' },
      { name: 'Omar Said', initials: 'OS', color: '#F59E0B', role: 'File Ops Analyst', reviews: 14, avgResponse: '8m 15s' },
    ],
    agents: [
      { name: 'agent-file-ops', status: 'warning' },
    ],
    decisions: { approved: 32, blocked: 18, pending: 2, blockRate: '32%' },
  },
  {
    id: 'team-monitoring',
    name: 'Monitoring & Observability',
    department: 'Operations',
    departmentColor: '#F59E0B',
    supervisor: { name: 'Lena Braun', initials: 'LB', color: '#3B82F6', role: 'Team Lead' },
    memberAvatars: [
      { initials: 'LB', color: '#3B82F6' },
      { initials: 'FH', color: '#E879F9' },
      { initials: 'IG', color: '#22D3EE' },
      { initials: 'MR', color: '#F97316' },
    ],
    memberCount: 4,
    status: 'Operational',
    agentCount: 1,
    reviews30d: 52,
    blocked: 4,
    avgRiskScore: 18,
    avgResponse: '2m 28s',
    violations: 0,
    lastActive: '4h ago',
    members: [
      { name: 'Lena Braun', initials: 'LB', color: '#3B82F6', role: 'Observability Lead', isLead: true, reviews: 18, avgResponse: '2m 05s' },
      { name: 'Finn Hoffman', initials: 'FH', color: '#E879F9', role: 'SRE', reviews: 14, avgResponse: '2m 30s' },
      { name: 'Ines Garcia', initials: 'IG', color: '#22D3EE', role: 'Monitoring Engineer', reviews: 12, avgResponse: '2m 50s' },
      { name: 'Mateo Ruiz', initials: 'MR', color: '#F97316', role: 'Ops Analyst', reviews: 8, avgResponse: '3m 00s' },
    ],
    agents: [
      { name: 'agent-alert-manager', status: 'online' },
    ],
    decisions: { approved: 44, blocked: 4, pending: 1, blockRate: '8%' },
  },
];
