/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║              SENTINEL PLATFORM — COMPREHENSIVE TEST RUNNER                 ║
 * ║                                                                            ║
 * ║  Usage:                                                                    ║
 * ║    node run.js                  Run all suites                             ║
 * ║    node run.js --suite ml       Run ML model tests only                    ║
 * ║    node run.js --suite api      Run API endpoint tests only                ║
 * ║    node run.js --suite fusion   Run Fusion engine tests only               ║
 * ║    node run.js --suite perf     Run performance benchmarks only            ║
 * ║    node run.js --suite security Run security tests only                    ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { printBanner, printFinalReport, C, ICONS } from './reporter.js';
import runMLTests from './suite_ml.js';
import runAPITests from './suite_api.js';
import runFusionTests from './suite_fusion.js';
import runPerformanceTests from './suite_performance.js';
import runSecurityTests from './suite_security.js';

const args = process.argv.slice(2);
const suiteFilter = args.includes('--suite') ? args[args.indexOf('--suite') + 1] : null;

const SUITE_MAP = {
  ml: runMLTests,
  api: runAPITests,
  fusion: runFusionTests,
  performance: runPerformanceTests,
  perf: runPerformanceTests,
  security: runSecurityTests,
};

async function main() {
  const startTime = Date.now();

  printBanner();

  console.log(`  ${C.dim}${ICONS.gear}  Backend:  ${process.env.BACKEND_URL || 'http://localhost:4000'}${C.reset}`);
  console.log(`  ${C.dim}${ICONS.brain}  ML Svc:   ${process.env.ML_URL || 'http://localhost:8000'}${C.reset}`);
  console.log(`  ${C.dim}${ICONS.clock}  Started:  ${new Date().toISOString()}${C.reset}`);
  if (suiteFilter) {
    console.log(`  ${C.dim}${ICONS.target}  Filter:   --suite ${suiteFilter}${C.reset}`);
  }
  console.log('');

  // Pre-flight connectivity check
  console.log(`  ${C.dim}Checking service connectivity...${C.reset}`);
  try {
    const [be, mlSvc] = await Promise.all([
      fetch(`${process.env.BACKEND_URL || 'http://localhost:4000'}/health`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${process.env.ML_URL || 'http://localhost:8000'}/health`, { signal: AbortSignal.timeout(5000) }),
    ]);
    if (!be.ok || !mlSvc.ok) {
      console.log(`  ${C.red}${ICONS.cross}  Service health check failed. Ensure backend (port 4000) and ML service (port 8000) are running.${C.reset}`);
      process.exit(1);
    }
    console.log(`  ${C.green}${ICONS.check}  All services reachable${C.reset}`);
  } catch (e) {
    console.log(`  ${C.red}${ICONS.cross}  Cannot connect to services: ${e.message}${C.reset}`);
    console.log(`  ${C.dim}   Run './start.sh' or 'docker-compose up' first.${C.reset}`);
    process.exit(1);
  }

  console.log('');
  console.log(`  ${C.brightCyan}${'═'.repeat(82)}${C.reset}`);
  console.log(`  ${C.brightCyan}  ${C.bold}RUNNING TEST SUITES${C.reset}`);
  console.log(`  ${C.brightCyan}${'═'.repeat(82)}${C.reset}`);

  const suites = [];

  if (suiteFilter && SUITE_MAP[suiteFilter]) {
    suites.push(await SUITE_MAP[suiteFilter]());
  } else if (suiteFilter) {
    console.log(`  ${C.red}Unknown suite: ${suiteFilter}. Available: ${Object.keys(SUITE_MAP).join(', ')}${C.reset}`);
    process.exit(1);
  } else {
    // Run all suites in order
    suites.push(await runMLTests());
    suites.push(await runAPITests());
    suites.push(await runFusionTests());
    suites.push(await runPerformanceTests());
    suites.push(await runSecurityTests());
  }

  // Final aggregate report
  printFinalReport(suites);

  const totalDuration = Date.now() - startTime;
  console.log(`  ${C.dim}Total execution time: ${(totalDuration / 1000).toFixed(1)}s${C.reset}`);
  console.log('');

  // Exit code
  const anyFailed = suites.some(s => s.failed > 0);
  process.exit(anyFailed ? 1 : 0);
}

main().catch((err) => {
  console.error(`${C.red}Fatal error: ${err.message}${C.reset}`);
  console.error(err.stack);
  process.exit(1);
});
