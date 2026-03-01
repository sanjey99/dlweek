export type Environment = 'PROD' | 'STAGING';

export type RiskStatus =
  | 'HIGH_RISK_PENDING'
  | 'HIGH_RISK_BLOCKED'
  | 'MEDIUM_RISK_PENDING'
  | 'LOW_RISK'
  | 'APPROVED';

/** UI-level panel states for truthfulness layer */
export type PanelState = 'loading' | 'live' | 'stale' | 'error';

export interface ActionItem {
  id: string;
  timestamp: string;
  agentName: string;
  proposedAction: string;
  environment: Environment;
  riskStatus: RiskStatus;
  riskScore: number;
  flagReasons: string[];
  /** Attribution: which ML model / pipeline produced this score */
  source?: string;
}

export interface Theme {
  bg: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  rowHover: string;
  tableHeaderBg: string;
}
