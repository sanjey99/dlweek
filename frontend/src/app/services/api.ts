/**
 * Sentinel API client — all backend communication goes through here.
 */

const API_BASE = ((import.meta as any).env?.VITE_API_URL as string | undefined) || 'http://localhost:4000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

// ── Action CRUD ──────────────────────────────────────────────────────────────

export interface ActionRecord {
  id: string;
  timestamp: string;
  timestampISO: string;
  agentName: string;
  proposedAction: string;
  environment: string;
  riskStatus: string;
  riskScore: number;
  source: string;
  flagReasons: string[];
  description: string;
  user?: string;
  mlResult?: {
    risk_category: string;
    risk_score: number;
    confidence: number;
    uncertainty: number;
    recommendation: string;
  };
  fusionResult?: {
    decision: string;
    risk_score: number;
    risk_category: string;
    uncertainty: number;
  };
}

export async function fetchActions(limit = 50): Promise<{ actions: ActionRecord[]; total: number }> {
  return request(`/api/actions?limit=${limit}`);
}

export async function submitAction(action: Record<string, unknown>): Promise<{ action: ActionRecord }> {
  return request('/api/actions/submit', {
    method: 'POST',
    body: JSON.stringify(action),
  });
}

export interface UploadResponse {
  ok: boolean;
  sessionId: string;
  total: number;
  delay_ms: number;
  message: string;
}

export async function uploadActions(
  actions: Record<string, unknown>[],
  delayMs = 2000
): Promise<UploadResponse> {
  return request('/api/actions/upload', {
    method: 'POST',
    body: JSON.stringify({ actions, delay_ms: delayMs }),
  });
}

export async function approveAction(id: string): Promise<{ action: ActionRecord }> {
  return request(`/api/actions/${id}/approve`, { method: 'POST' });
}

export async function blockAction(id: string): Promise<{ action: ActionRecord }> {
  return request(`/api/actions/${id}/block`, { method: 'POST' });
}

export async function escalateAction(id: string): Promise<{ action: ActionRecord }> {
  return request(`/api/actions/${id}/escalate`, { method: 'POST' });
}

// ── ML / health ──────────────────────────────────────────────────────────────

export async function fetchModelInfo(): Promise<Record<string, unknown>> {
  return request('/api/model-info');
}

export async function classifyText(text: string): Promise<Record<string, unknown>> {
  return request('/api/classify', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export async function testAccuracy(actions: Record<string, unknown>[]): Promise<Record<string, unknown>> {
  return request('/api/accuracy', {
    method: 'POST',
    body: JSON.stringify({ actions }),
  });
}

export async function fetchHealth(): Promise<{ ok: boolean }> {
  return request('/health');
}
