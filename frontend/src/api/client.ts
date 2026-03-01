/**
 * FinSentinel API client.
 *
 * All URLs are relative (`/api/…`) so the dev-server proxy (vite) and
 * the production reverse-proxy (nginx) route them transparently.
 */

// ─── Response / Domain types ─────────────────────────────────────────────────

export interface PolicyDecision {
  decision: string;
  reasonTags: string[];
  confidence: number;
}

export interface ActionRecord {
  actionId: string;
  action: { type: string; target: string; payload?: unknown };
  context: Record<string, unknown>;
  policy: PolicyDecision;
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

export interface ActionsListResponse {
  ok: boolean;
  actions: ActionRecord[];
  ledger: unknown[];
}

export interface ProposePayload {
  action: { type: string; target: string; payload?: unknown };
  context: Record<string, unknown>;
  features?: number[];
}

export interface ProposeResponse {
  ok: boolean;
  actionId: string;
  status: string;
  decision: string;
}

export interface ResolveResponse {
  ok: boolean;
  actionId: string;
  status: string;
  decision: string;
  resolution: ActionRecord['resolution'];
}

export interface WsSignalEvent {
  type: 'action_resolved' | 'action_updated' | 'new_action';
  actionId: string;
  status: string;
  decision: string;
  resolution: ActionRecord['resolution'];
  action?: ActionRecord;
  timestamp: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ─── Internal fetch helper ───────────────────────────────────────────────────

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch (err) {
    throw new ApiError(
      `Network error: ${err instanceof Error ? err.message : String(err)}`,
      0,
    );
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiError(`Invalid JSON from ${url}`, res.status);
  }

  if (!res.ok) {
    const msg =
      (body as Record<string, unknown>)?.error ??
      (body as Record<string, unknown>)?.message ??
      `HTTP ${res.status}`;
    throw new ApiError(String(msg), res.status, body);
  }

  return body as T;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Fetch every governance action and the audit ledger. */
export function getActions(): Promise<ActionsListResponse> {
  return request<ActionsListResponse>('/api/governance/actions');
}

/** Submit a new action proposal for policy evaluation. */
export function proposeAction(payload: ProposePayload): Promise<ProposeResponse> {
  return request<ProposeResponse>('/api/governance/actions/propose', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Approve a pending-review action. */
export function approveAction(
  actionId: string,
  actor = 'human-reviewer',
): Promise<ResolveResponse> {
  return request<ResolveResponse>('/api/action/approve', {
    method: 'POST',
    body: JSON.stringify({ actionId, actor }),
  });
}

/** Block a pending-review action. */
export function blockAction(
  actionId: string,
  actor = 'human-reviewer',
): Promise<ResolveResponse> {
  return request<ResolveResponse>('/api/action/block', {
    method: 'POST',
    body: JSON.stringify({ actionId, actor }),
  });
}

/**
 * Open a WebSocket to `/ws/signals` and invoke `onEvent` for every
 * governance signal (action_resolved / action_updated).
 *
 * Returns a teardown function that closes the socket.
 */
export function connectSignalsWS(
  onEvent: (evt: WsSignalEvent) => void,
): () => void {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws/signals`);

  let disposed = false;

  ws.onmessage = (msg) => {
    try {
      const data: WsSignalEvent = JSON.parse(msg.data);
      if (data.type === 'action_resolved' || data.type === 'action_updated') {
        onEvent(data);
      }
    } catch {
      // ignore non-JSON frames (market ticks, pings, etc.)
    }
  };

  ws.onerror = () => {
    if (!disposed) {
      // auto-reconnect after 3 s
      setTimeout(() => {
        if (!disposed) connectSignalsWS(onEvent);
      }, 3_000);
    }
  };

  return () => {
    disposed = true;
    ws.close();
  };
}
