// Split from ci-fast-lanes.mjs to keep that file under its size cap.
const PREFLIGHT_COVERAGE_TESTS = [
  'scripts/preflight.test.mjs',
  'scripts/verify-workflow-references.test.mjs',
];
const PREFLIGHT_COVERAGE_ARGS = [
  '--test',
  '--experimental-test-coverage',
  '--test-coverage-include=scripts/preflight.mjs',
  '--test-coverage-include=scripts/lib/source-guard-action-snapshot.mjs',
];

/** Keep unrelated scanners outside V8 instrumentation; run every selection once.
 * @param {readonly string[]} tests @returns {string[][]}
 */
export function scriptContractNodeArgs(tests) {
  const focused = tests.filter(test => PREFLIGHT_COVERAGE_TESTS.includes(test));
  const plain = tests.filter(test => !PREFLIGHT_COVERAGE_TESTS.includes(test));
  const batches = [];
  if (focused.length) batches.push([...PREFLIGHT_COVERAGE_ARGS, ...focused]);
  if (plain.length) batches.push(['--test', ...plain]);
  return batches;
}
