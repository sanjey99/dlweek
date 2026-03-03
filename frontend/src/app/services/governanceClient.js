function parseJsonSafe(text) {
  if (!text || text.trim().length === 0) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export class GovernanceApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'GovernanceApiError';
    this.status = status;
    this.body = body;
  }
}

async function requestJson(fetchImpl, url, init) {
  const response = await fetchImpl(url, init);
  const bodyText = await response.text();
  const body = parseJsonSafe(bodyText);
  if (!response.ok || body?.ok === false) {
    const message = typeof body?.error === 'string' ? body.error : `Request failed (${response.status})`;
    throw new GovernanceApiError(message, response.status, body);
  }
  return body;
}

function toMlLabel(riskScore01) {
  if (riskScore01 >= 0.8) return 'anomaly';
  if (riskScore01 >= 0.45) return 'warning';
  return 'normal';
}

export function buildProposePayloadFromUiAction(action) {
  const riskScore01 = 0.58;
  return {
    action: { type: 'merge-main' },
    context: {
      riskScore: riskScore01,
      mlConfidence: 0.82,
      testsPassing: true,
      touchesCriticalPaths: action.riskScore >= 50,
      targetEnvironment: action.environment === 'PROD' ? 'prod' : 'staging',
      destructive: false,
      rollbackPlanPresent: true,
    },
    ml_assessment: {
      risk_score: riskScore01,
      confidence: 0.82,
      label: toMlLabel(riskScore01),
      timestamp: new Date().toISOString(),
    },
  };
}

export async function proposeGovernanceAction({
  apiBaseUrl,
  action,
  fetchImpl = fetch,
}) {
  return requestJson(fetchImpl, `${apiBaseUrl}/api/governance/actions/propose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildProposePayloadFromUiAction(action)),
  });
}

export async function resolveGovernanceAction({
  apiBaseUrl,
  actionId,
  resolution,
  actor = 'ui-reviewer',
  notes = '',
  fetchImpl = fetch,
}) {
  const endpointByResolution = {
    approve: '/api/action/approve',
    block: '/api/action/block',
  };
  const endpoint = endpointByResolution[resolution];
  if (!endpoint) throw new Error(`Unsupported resolution: ${resolution}`);

  return requestJson(fetchImpl, `${apiBaseUrl}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actionId, actor, notes }),
  });
}

export function mapBackendStatusToUiRiskStatus(status, currentRiskStatus) {
  if (status === 'approved_by_human' || status === 'approved_auto') return 'APPROVED';
  if (status === 'blocked_by_human' || status === 'blocked') {
    if (currentRiskStatus === 'MEDIUM_RISK_PENDING') return 'MEDIUM_RISK_BLOCKED';
    return 'HIGH_RISK_BLOCKED';
  }
  if (status === 'pending_review' || status === 'escalated') return 'MEDIUM_RISK_PENDING';
  return currentRiskStatus;
}

export function applyResolutionToActions(actions, uiActionId, backendStatus) {
  const updated = actions.map((action) => {
    if (action.id !== uiActionId) return action;
    return {
      ...action,
      riskStatus: mapBackendStatusToUiRiskStatus(backendStatus, action.riskStatus),
    };
  });

  const nextPending = updated.find(
    (action) => action.id !== uiActionId
      && (action.riskStatus === 'HIGH_RISK_PENDING' || action.riskStatus === 'MEDIUM_RISK_PENDING'),
  ) || null;

  return { updated, nextPending };
}

export function isInvalidTransitionError(error) {
  return error instanceof GovernanceApiError
    && error.status === 409
    && /invalid transition/i.test(String(error.message || ''));
}
