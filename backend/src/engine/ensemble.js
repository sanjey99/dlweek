export function inferRegime(markets) {
  const avgAbsMove = markets.reduce((a, m) => a + Math.abs(m.changePct), 0) / Math.max(markets.length, 1);
  if (avgAbsMove > 1.2) return { regime: 'high-volatility', score: 0.82 };
  if (avgAbsMove > 0.5) return { regime: 'transition', score: 0.64 };
  return { regime: 'stable', score: 0.78 };
}

export function inferAction(anomaly, regime) {
  let action = 'hold';
  let confidence = 0.55;
  if (anomaly.label === 'anomaly' && regime.regime === 'high-volatility') {
    action = 'hedge-reduce-risk';
    confidence = 0.83;
  } else if (anomaly.label === 'anomaly') {
    action = 'rebalance-defensive';
    confidence = 0.74;
  } else if (regime.regime === 'stable') {
    action = 'hold-monitor';
    confidence = 0.69;
  }
  return { action, confidence };
}

export function runEnsemble({ anomaly, regime }) {
  const action = inferAction(anomaly, regime);
  const disagreement = anomaly.label === 'normal' && regime.regime === 'high-volatility';
  return {
    anomaly,
    regime,
    action,
    disagreement,
    uncertainty: disagreement ? 0.42 : 0.18,
    summary: disagreement ? 'Models disagree: volatility regime elevated but anomaly detector is calm.' : 'Models aligned.',
  };
}
