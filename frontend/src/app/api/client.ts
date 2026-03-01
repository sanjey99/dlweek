/**
 * API client for FinSentinel backend.
 *
 * In dev, vite proxy forwards /api → localhost:4000.
 * In prod, nginx handles the reverse proxy.
 */

const BASE = ''; // same-origin — proxy handles routing

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BackendAction {
  actionId: string;
  action: { type: string; target: string; payload?: unknown };
  context: Record<string, unknown>;
  policy: {
    decision: string;
    reasonTags: string[];
    confidence: number;
  };
  status: string;
  createdAt: string;
  updatedAt: string;
  resolution: {
    type: string;
    notes: string | null;
    actor: string;
    ts: string;
  } | null;
}

export interface ResolveResult {
  ok: boolean;
  actionId: string;
  status: string;
  decision: string;
  resolution: BackendAction['resolution'];
}

export interface WsActionResolved {
  type: 'action_resolved' | 'action_updated' | 'new_action';
  actionId: string;
  status: string;
  decision: string;
  resolution: BackendAction['resolution'];
  action?: BackendAction;
  timestamp: string;
}

// ─── Fetch helpers ───────────────────────────────────────────────────────────

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body as T;
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

export function fetchActions() {
  return json<{ ok: boolean; actions: BackendAction[]; ledger: unknown }>(
    '/api/governance/actions',
  );
}

export function proposeAction(payload: {
  action: { type: string; target: string; payload?: unknown };
  context: Record<string, unknown>;
  features?: number[];
}) {
  return json<{ ok: boolean; actionId: string; status: string; decision: string }>(
    '/api/governance/actions/propose',
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export function approveAction(actionId: string, actor = 'human-reviewer') {
  return json<ResolveResult>(
    '/api/action/approve',
    { method: 'POST', body: JSON.stringify({ actionId, actor }) },
  );
}

export function blockAction(actionId: string, actor = 'human-reviewer') {
  return json<ResolveResult>(
    '/api/action/block',
    { method: 'POST', body: JSON.stringify({ actionId, actor }) },
  );
}

export function escalateAction(actionId: string, actor = 'human-reviewer') {
  return json<ResolveResult>(
    '/api/action/escalate',
    { method: 'POST', body: JSON.stringify({ actionId, actor }) },
  );
}

// ─── WebSocket ───────────────────────────────────────────────────────────────

export function connectWs(onMessage: (data: WsActionResolved) => void): () => void {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${window.location.host}/ws/signals`);

  ws.onmessage = (evt) => {
    try {
      const data = JSON.parse(evt.data);
      if (data.type === 'action_resolved' || data.type === 'action_updated' || data.type === 'new_action') {
        onMessage(data as WsActionResolved);
      }
    } catch {
      // ignore non-JSON frames (e.g. market ticks)
    }
  };

  ws.onerror = () => {
    // silently reconnect after a short delay
    setTimeout(() => connectWs(onMessage), 3000);
  };

  return () => ws.close();
}
