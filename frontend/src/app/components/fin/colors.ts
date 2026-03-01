export const C = {
  bg: '#0A0D11',
  bgPanel: '#0D1117',
  bgAlt: '#111820',
  bgCard: '#0F1318',
  orange: '#FF6B00',
  orangeLight: '#FF8C33',
  cyan: '#00D4FF',
  green: '#00FF9C',
  red: '#FF3B3B',
  yellow: '#FFD600',
  text: '#E8E8E8',
  textMuted: '#4B5563',
  textDim: '#6B7280',
  border: '#1E2530',
  borderBright: '#2A3441',
  mono: "'JetBrains Mono', 'Courier New', monospace",
  sans: "'Inter', system-ui, sans-serif",
};

export const getScoreColor = (score: number) => {
  if (score < 40) return C.green;
  if (score < 70) return C.yellow;
  return C.red;
};

export const getScoreTier = (score: number): { label: string; color: string; bg: string } => {
  if (score < 40) return { label: 'LOW', color: C.green, bg: 'rgba(0,255,156,0.12)' };
  if (score < 55) return { label: 'MEDIUM', color: C.yellow, bg: 'rgba(255,214,0,0.12)' };
  if (score < 70) return { label: 'HIGH', color: C.orange, bg: 'rgba(255,107,0,0.12)' };
  return { label: 'CRITICAL', color: C.red, bg: 'rgba(255,59,59,0.12)' };
};
