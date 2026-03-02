/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                  SENTINEL PLATFORM — COMPREHENSIVE TEST SUITE              ║
 * ║                         Pretty Console Reporter                            ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * A beautiful, human-readable test reporter for hackathon demonstrations.
 * Zero dependencies — uses only Node.js built-ins.
 */

// ─── ANSI color codes ──────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  // Foreground
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  // Bright foreground
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',
  // Background
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
  bgGray: '\x1b[100m',
};

const ICONS = {
  pass: '✅',
  fail: '❌',
  warn: '⚠️ ',
  skip: '⏭️ ',
  suite: '📦',
  rocket: '🚀',
  brain: '🧠',
  shield: '🛡️',
  chart: '📊',
  clock: '⏱️',
  link: '🔗',
  lock: '🔒',
  eye: '👁️',
  fire: '🔥',
  check: '✔',
  cross: '✘',
  dot: '●',
  arrow: '→',
  star: '⭐',
  trophy: '🏆',
  target: '🎯',
  gear: '⚙️',
  database: '🗄️',
  wave: '〰️',
};

// ─── Layout helpers ────────────────────────────────────────────────────────────

const WIDTH = 88;
const PAD = 2;

function line(char = '─', width = WIDTH) {
  return char.repeat(width);
}

function boxTop(title = '', width = WIDTH) {
  if (!title) return `╔${line('═', width - 2)}╗`;
  const padded = ` ${title} `;
  const remain = width - 2 - padded.length;
  const left = Math.floor(remain / 2);
  const right = remain - left;
  return `╔${'═'.repeat(left)}${padded}${'═'.repeat(right)}╗`;
}

function boxMid(text = '', width = WIDTH) {
  const stripped = text.replace(/\x1b\[[0-9;]*m/g, '');
  const pad = width - 4 - stripped.length;
  if (pad < 0) return `║ ${text}${C.reset} ║`;
  return `║ ${text}${' '.repeat(pad)} ${C.reset}║`;
}

function boxBottom(width = WIDTH) {
  return `╚${line('═', width - 2)}╝`;
}

function boxSep(width = WIDTH) {
  return `╟${line('─', width - 2)}╢`;
}

function center(text, width = WIDTH) {
  const stripped = text.replace(/\x1b\[[0-9;]*m/g, '');
  const pad = Math.max(0, Math.floor((width - stripped.length) / 2));
  return ' '.repeat(pad) + text;
}

function rightAlign(label, value, width = WIDTH - 6) {
  const strippedLabel = label.replace(/\x1b\[[0-9;]*m/g, '');
  const strippedValue = value.replace(/\x1b\[[0-9;]*m/g, '');
  const gap = width - strippedLabel.length - strippedValue.length;
  return `${label}${C.dim}${'.'.repeat(Math.max(2, gap))}${C.reset}${value}`;
}

// ─── Progress bar ──────────────────────────────────────────────────────────────

function progressBar(ratio, width = 30, filled = '█', empty = '░') {
  const clamped = Math.max(0, Math.min(1, ratio));
  const count = Math.round(clamped * width);
  let color = C.green;
  if (clamped < 0.5) color = C.red;
  else if (clamped < 0.8) color = C.yellow;
  return `${color}${filled.repeat(count)}${C.dim}${empty.repeat(width - count)}${C.reset}`;
}

function pct(ratio) {
  const p = (ratio * 100).toFixed(1);
  let color = C.brightGreen;
  if (ratio < 0.5) color = C.brightRed;
  else if (ratio < 0.8) color = C.brightYellow;
  return `${color}${p}%${C.reset}`;
}

// ─── Suite/Test result collection ──────────────────────────────────────────────

export class TestSuite {
  constructor(name, icon = ICONS.suite) {
    this.name = name;
    this.icon = icon;
    this.tests = [];
    this.startTime = null;
    this.endTime = null;
    this.metadata = {};
  }

  setMetadata(key, value) {
    this.metadata[key] = value;
  }

  addTest(name, status, details = {}) {
    this.tests.push({ name, status, details, timestamp: new Date() });
  }

  pass(name, details = {}) { this.addTest(name, 'pass', details); }
  fail(name, details = {}) { this.addTest(name, 'fail', details); }
  warn(name, details = {}) { this.addTest(name, 'warn', details); }
  skip(name, details = {}) { this.addTest(name, 'skip', details); }

  get passed() { return this.tests.filter(t => t.status === 'pass').length; }
  get failed() { return this.tests.filter(t => t.status === 'fail').length; }
  get warned() { return this.tests.filter(t => t.status === 'warn').length; }
  get skipped() { return this.tests.filter(t => t.status === 'skip').length; }
  get total() { return this.tests.length; }
  get passRate() { return this.total > 0 ? this.passed / this.total : 0; }
  get durationMs() {
    if (!this.startTime || !this.endTime) return 0;
    return this.endTime - this.startTime;
  }
}

// ─── Pretty printer ───────────────────────────────────────────────────────────

export function printBanner() {
  console.log('');
  console.log(`${C.brightCyan}${boxTop('SENTINEL GOVERNANCE PLATFORM', WIDTH)}${C.reset}`);
  console.log(`${C.brightCyan}${boxMid('')}${C.reset}`);
  console.log(`${C.brightCyan}${boxMid(`${C.brightWhite}${C.bold}        ███████╗███████╗███╗   ██╗████████╗██╗███╗   ██╗███████╗██╗     `)}${C.reset}`);
  console.log(`${C.brightCyan}${boxMid(`${C.brightWhite}${C.bold}        ██╔════╝██╔════╝████╗  ██║╚══██╔══╝██║████╗  ██║██╔════╝██║     `)}${C.reset}`);
  console.log(`${C.brightCyan}${boxMid(`${C.brightWhite}${C.bold}        ███████╗█████╗  ██╔██╗ ██║   ██║   ██║██╔██╗ ██║█████╗  ██║     `)}${C.reset}`);
  console.log(`${C.brightCyan}${boxMid(`${C.brightWhite}${C.bold}        ╚════██║██╔══╝  ██║╚██╗██║   ██║   ██║██║╚██╗██║██╔══╝  ██║     `)}${C.reset}`);
  console.log(`${C.brightCyan}${boxMid(`${C.brightWhite}${C.bold}        ███████║███████╗██║ ╚████║   ██║   ██║██║ ╚████║███████╗███████╗`)}${C.reset}`);
  console.log(`${C.brightCyan}${boxMid(`${C.brightWhite}${C.bold}        ╚══════╝╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝`)}${C.reset}`);
  console.log(`${C.brightCyan}${boxMid('')}${C.reset}`);
  console.log(`${C.brightCyan}${boxMid(`${C.dim}  AI Agent Governance Platform — Comprehensive Validation Suite`)}${C.reset}`);
  console.log(`${C.brightCyan}${boxMid(`${C.dim}  Testing ML Models • API Endpoints • Policy Engine • Fusion Logic`)}${C.reset}`);
  console.log(`${C.brightCyan}${boxMid('')}${C.reset}`);
  console.log(`${C.brightCyan}${boxBottom(WIDTH)}${C.reset}`);
  console.log('');
}

export function printSuiteHeader(suite) {
  console.log('');
  console.log(`  ${C.brightCyan}┌${line('─', WIDTH - 6)}┐${C.reset}`);
  console.log(`  ${C.brightCyan}│${C.reset} ${suite.icon}  ${C.bold}${C.brightWhite}${suite.name}${C.reset}${' '.repeat(Math.max(1, WIDTH - 10 - suite.name.length))}${C.brightCyan}│${C.reset}`);
  console.log(`  ${C.brightCyan}└${line('─', WIDTH - 6)}┘${C.reset}`);
}

export function printSuiteResults(suite) {
  const statusIcon = (s) => {
    switch (s) {
      case 'pass': return `${C.green}${ICONS.check}${C.reset}`;
      case 'fail': return `${C.red}${ICONS.cross}${C.reset}`;
      case 'warn': return `${C.yellow}!${C.reset}`;
      case 'skip': return `${C.gray}○${C.reset}`;
      default: return '?';
    }
  };

  for (const t of suite.tests) {
    const icon = statusIcon(t.status);
    let detailStr = '';
    if (t.details.latency) detailStr += ` ${C.dim}(${t.details.latency}ms)${C.reset}`;
    if (t.details.value !== undefined) detailStr += ` ${C.cyan}${ICONS.arrow} ${t.details.value}${C.reset}`;
    if (t.details.expected !== undefined && t.details.actual !== undefined) {
      if (t.status === 'fail') {
        detailStr += ` ${C.red}expected=${t.details.expected} got=${t.details.actual}${C.reset}`;
      }
    }
    if (t.details.info) detailStr += ` ${C.dim}${t.details.info}${C.reset}`;
    console.log(`    ${icon}  ${t.name}${detailStr}`);
  }

  // Suite summary line
  const dur = suite.durationMs > 0 ? ` ${C.dim}in ${suite.durationMs}ms${C.reset}` : '';
  console.log('');
  console.log(`    ${C.dim}${line('╌', 60)}${C.reset}`);

  let summary = `    ${C.green}${suite.passed} passed${C.reset}`;
  if (suite.failed > 0) summary += `  ${C.red}${suite.failed} failed${C.reset}`;
  if (suite.warned > 0) summary += `  ${C.yellow}${suite.warned} warnings${C.reset}`;
  if (suite.skipped > 0) summary += `  ${C.gray}${suite.skipped} skipped${C.reset}`;
  summary += `  ${C.dim}(${suite.total} total)${C.reset}${dur}`;
  console.log(summary);
}

export function printMetricsTable(title, rows) {
  // rows: [{ label, value, bar?, color? }]
  console.log('');
  console.log(`    ${C.bold}${C.brightWhite}${title}${C.reset}`);
  console.log(`    ${C.dim}${line('─', 62)}${C.reset}`);
  for (const row of rows) {
    const barStr = row.bar !== undefined ? `  ${progressBar(row.bar, 20)}` : '';
    const valColor = row.color || C.brightWhite;
    console.log(`    ${rightAlign(row.label, `${valColor}${row.value}${C.reset}`, 50)}${barStr}`);
  }
  console.log(`    ${C.dim}${line('─', 62)}${C.reset}`);
}

export function printConfusionMatrix(matrix, labels) {
  console.log('');
  console.log(`    ${C.bold}${C.brightWhite}Confusion Matrix${C.reset}`);
  console.log(`    ${C.dim}${line('─', 52)}${C.reset}`);

  // Header
  let header = `    ${C.dim}${'Predicted →'.padEnd(16)}${C.reset}`;
  for (const l of labels) {
    header += `${C.bold}${C.cyan}${l.padStart(10)}${C.reset}`;
  }
  console.log(header);
  console.log(`    ${C.dim}${'Actual ↓'.padEnd(16)}${C.reset}`);

  for (let i = 0; i < labels.length; i++) {
    let row = `    ${C.bold}${C.yellow}${labels[i].padEnd(16)}${C.reset}`;
    for (let j = 0; j < labels.length; j++) {
      const val = matrix[i][j] || 0;
      const color = i === j ? C.brightGreen : (val > 0 ? C.brightRed : C.dim);
      row += `${color}${String(val).padStart(10)}${C.reset}`;
    }
    console.log(row);
  }
  console.log(`    ${C.dim}${line('─', 52)}${C.reset}`);
}

export function printLatencyHistogram(latencies, label = 'Response Time Distribution') {
  console.log('');
  console.log(`    ${C.bold}${C.brightWhite}${label}${C.reset}`);
  console.log(`    ${C.dim}${line('─', 62)}${C.reset}`);

  const buckets = [
    { label: '< 50ms', max: 50 },
    { label: '50-100ms', max: 100 },
    { label: '100-200ms', max: 200 },
    { label: '200-500ms', max: 500 },
    { label: '500ms-1s', max: 1000 },
    { label: '> 1s', max: Infinity },
  ];

  const counts = buckets.map(() => 0);
  for (const l of latencies) {
    for (let i = 0; i < buckets.length; i++) {
      if (l < buckets[i].max || i === buckets.length - 1) {
        counts[i]++;
        break;
      }
    }
  }

  const maxCount = Math.max(...counts, 1);
  const barWidth = 30;

  for (let i = 0; i < buckets.length; i++) {
    const pctVal = latencies.length > 0 ? counts[i] / latencies.length : 0;
    const bar = Math.round((counts[i] / maxCount) * barWidth);
    let color = C.brightGreen;
    if (buckets[i].max > 500) color = C.brightRed;
    else if (buckets[i].max > 200) color = C.brightYellow;
    const barStr = `${color}${'█'.repeat(bar)}${C.dim}${'░'.repeat(barWidth - bar)}${C.reset}`;
    console.log(`    ${C.dim}${buckets[i].label.padEnd(12)}${C.reset}${barStr} ${C.dim}${counts[i]}${C.reset} ${C.dim}(${(pctVal * 100).toFixed(0)}%)${C.reset}`);
  }

  const avg = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);
  console.log(`    ${C.dim}${line('─', 62)}${C.reset}`);
  console.log(`    ${C.dim}avg=${avg.toFixed(0)}ms  p50=${p50.toFixed(0)}ms  p95=${p95.toFixed(0)}ms  p99=${p99.toFixed(0)}ms${C.reset}`);
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function printFinalReport(suites) {
  const totalTests = suites.reduce((s, suite) => s + suite.total, 0);
  const totalPass = suites.reduce((s, suite) => s + suite.passed, 0);
  const totalFail = suites.reduce((s, suite) => s + suite.failed, 0);
  const totalWarn = suites.reduce((s, suite) => s + suite.warned, 0);
  const totalSkip = suites.reduce((s, suite) => s + suite.skipped, 0);
  const totalDuration = suites.reduce((s, suite) => s + suite.durationMs, 0);
  const overallRate = totalTests > 0 ? totalPass / totalTests : 0;

  console.log('');
  console.log('');
  console.log(`${C.brightCyan}${boxTop('FINAL REPORT', WIDTH)}${C.reset}`);
  console.log(`${C.brightCyan}${boxMid('')}${C.reset}`);

  for (const suite of suites) {
    const rate = suite.passRate;
    const icon = rate === 1 ? ICONS.pass : (suite.failed > 0 ? ICONS.fail : ICONS.warn);
    const rateStr = pct(rate);
    const name = `  ${icon}  ${suite.name}`;
    const right = `${suite.passed}/${suite.total} ${rateStr}`;
    const stripped = name.replace(/\x1b\[[0-9;]*m/g, '').replace(/[^\x20-\x7E]/g, 'X');
    const strippedR = right.replace(/\x1b\[[0-9;]*m/g, '').replace(/[^\x20-\x7E]/g, 'X');
    const gap = Math.max(2, WIDTH - 6 - stripped.length - strippedR.length);
    console.log(`${C.brightCyan}${boxMid(`${name}${C.dim}${'.'.repeat(gap)}${C.reset}${right}`)}${C.reset}`);
  }

  console.log(`${C.brightCyan}${boxMid('')}${C.reset}`);
  console.log(`${C.brightCyan}${boxSep(WIDTH)}${C.reset}`);
  console.log(`${C.brightCyan}${boxMid('')}${C.reset}`);

  const overall = `  ${ICONS.trophy}  Overall: ${C.bold}${totalPass}/${totalTests}${C.reset} tests passed   ${progressBar(overallRate, 25)}  ${pct(overallRate)}`;
  console.log(`${C.brightCyan}${boxMid(overall)}${C.reset}`);

  const breakdown = `     ${C.green}${totalPass} passed${C.reset}   ${C.red}${totalFail} failed${C.reset}   ${C.yellow}${totalWarn} warnings${C.reset}   ${C.gray}${totalSkip} skipped${C.reset}   ${C.dim}${totalDuration}ms total${C.reset}`;
  console.log(`${C.brightCyan}${boxMid(breakdown)}${C.reset}`);
  console.log(`${C.brightCyan}${boxMid('')}${C.reset}`);

  // Confidence level
  let confidence = 'PRODUCTION READY';
  let confColor = C.brightGreen;
  let confIcon = ICONS.rocket;
  if (totalFail > 0) {
    confidence = 'ISSUES DETECTED';
    confColor = C.brightRed;
    confIcon = ICONS.fire;
  } else if (totalWarn > 2) {
    confidence = 'REVIEW RECOMMENDED';
    confColor = C.brightYellow;
    confIcon = ICONS.warn;
  }

  console.log(`${C.brightCyan}${boxMid(`  ${confIcon}  Platform Status: ${confColor}${C.bold}${confidence}${C.reset}`)}${C.reset}`);
  console.log(`${C.brightCyan}${boxMid(`     ${C.dim}Tested: ${new Date().toISOString()}${C.reset}`)}${C.reset}`);
  console.log(`${C.brightCyan}${boxMid('')}${C.reset}`);
  console.log(`${C.brightCyan}${boxBottom(WIDTH)}${C.reset}`);
  console.log('');
}

export { C, ICONS, WIDTH, line, progressBar, pct, rightAlign, percentile };
