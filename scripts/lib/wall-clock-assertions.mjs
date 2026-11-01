// Finds wall-clock assertions in merge-gating tests (JOV-10086).
//
// A test that asserts how long something took, or races a real timer against
// an assertion, fails on a loaded runner and takes the whole merge group with
// it. Assert on order, state or an injected clock instead. A genuine perf
// budget belongs in a `*.perf.test.*` file, which gating suites exclude and
// the non-blocking perf lane runs.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const PERF_FILE = /\.perf\.test\.|(^|\/)test_[^/]*_perf\.py$/;
export const TEST_FILE =
  /(\.test\.(mjs|cjs|js|ts|tsx)|(^|\/)test_[^/]+\.py|\.test\.py)$/;
const EXCLUDED_DIR = /(^|\/)(node_modules|e2e|playwright)\//;
const OPT_OUT = /wall-clock-ok:\s*\S/;

// A clock read or a duration-named value feeding a comparison.
const CLOCK = String.raw`(?:Date\.now\(\)|performance\.now\(\)|time\.time\(\)|time\.monotonic\(\)|time\.perf_counter\(\)|\b(?:elapsed|elapsedMs|duration|durationMs|took|tookMs)\b)`;
const JS_PATTERNS = [
  new RegExp(
    String.raw`expect\([^;]*${CLOCK}[^;]*\)\s*\.\s*(?:toBeLessThan|toBeLessThanOrEqual|toBeGreaterThan|toBeGreaterThanOrEqual)\(`
  ),
  new RegExp(String.raw`assert(?:\.ok)?\([^;]*${CLOCK}[^;]*[<>]=?\s*[\d(]`),
];
const PY_PATTERNS = [
  new RegExp(String.raw`^\s*assert\b[^\n]*${CLOCK}[^\n]*[<>]=?`),
  new RegExp(String.raw`assert(?:Less|Greater)(?:Equal)?\([^)]*${CLOCK}`),
];

/** Returns the 1-based line numbers of wall-clock assertions in `source`. */
export function findWallClockAssertions(source, file = 'x.test.mjs') {
  const python = file.endsWith('.py');
  const patterns = python ? PY_PATTERNS : JS_PATTERNS;
  const lines = source.split('\n');
  const hits = [];
  for (let index = 0; index < lines.length; index += 1) {
    // Join the statement across wrapped lines so formatter wrapping cannot hide it.
    let statement = lines[index];
    for (
      let extra = 1;
      !python && extra <= 4 && !/;\s*$/.test(statement);
      extra += 1
    ) {
      if (index + extra >= lines.length) break;
      statement += ` ${lines[index + extra].trim()}`;
    }
    if (!patterns.some(pattern => pattern.test(statement))) continue;
    if (OPT_OUT.test(lines[index]) || OPT_OUT.test(lines[index - 1] ?? ''))
      continue;
    hits.push(index + 1);
  }
  return hits;
}

export function listGatingTestFiles(repoRoot) {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split('\0')
    .filter(
      file =>
        TEST_FILE.test(file) &&
        !PERF_FILE.test(file) &&
        !EXCLUDED_DIR.test(file)
    );
}

export function scanRepo(repoRoot) {
  const counts = {};
  for (const file of listGatingTestFiles(repoRoot)) {
    let source;
    try {
      source = readFileSync(`${repoRoot}/${file}`, 'utf8');
    } catch {
      continue;
    }
    const hits = findWallClockAssertions(source, file);
    if (hits.length > 0) counts[file] = hits.length;
  }
  return counts;
}
