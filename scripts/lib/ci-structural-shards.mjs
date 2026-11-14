import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * ci-fast (structural lanes) runs as two matrix legs on separate runners: leg
 * ab runs shards a+b, leg cd runs c+d, and each combines its pair into
 * jovie-lanes-<group>.coverage for the lanes-coverage report job, which merges
 * both and enforces the unchanged per-module floors on the full suite.
 */
export const LANES_COVERAGE_GROUP_SHARDS = Object.freeze({
  ab: Object.freeze(['a', 'b']),
  cd: Object.freeze(['c', 'd']),
});
export const lanesCoverageGroupCommands = (allShards, run, wrap) =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(LANES_COVERAGE_GROUP_SHARDS).map(([group, ids]) => {
        const shards = ids.map(id => {
          const shard = allShards.find(entry => entry.id === id);
          if (!shard) {
            throw new Error(`unknown lanes coverage shard ${id}`);
          }
          return shard;
        });
        return [group, wrap(run(shards, `jovie-lanes-${group}`))];
      })
    )
  );

/**
 * The lanes-coverage evidence gate shared by the lanes matrix legs and the
 * report job: the runner's own receipt decides. 'success' means the leg's
 * suite executed (its combined data file is required); 'skipped' means the
 * head selected no operations pool, so the suite was legitimately not
 * applicable; anything else (failure, a missing structural lane) fails
 * closed. Exported for tests; the workflow calls it through
 * `node --input-type=module --eval` so the gate is the runner's own outcome,
 * never a recomputed selection that could drift from what actually ran.
 * @param {{lanes?: Array<{id?: string, status?: string}>}} receipt
 */
export function lanesReceiptRanSuite(receipt) {
  const structural = (receipt?.lanes ?? []).find(
    lane => lane.id === 'structural'
  );
  if (!structural) {
    throw new Error('lanes receipt is missing the structural lane');
  }
  if (structural.status === 'success') return true;
  if (structural.status === 'skipped') return false;
  throw new Error(
    `lanes coverage data missing but the structural lane reported ${structural.status}`
  );
}

/**
 * Per-module lanes coverage floors, one `<include>\t<floor>` row per line in
 * .github/ci-harness/lanes-coverage-floors.txt. The file is the single source
 * for both this command list and the lanes-coverage report job's bash step
 * (the structural-control-paths.ere data-file pattern, JOV-6837), so the two
 * cannot drift. Malformed rows fail closed at module load.
 */
export const LANES_COVERAGE_FLOORS = Object.freeze(
  readFileSync(
    resolve(
      import.meta.dirname,
      '..',
      '..',
      '.github/ci-harness/lanes-coverage-floors.txt'
    ),
    'utf8'
  )
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const [include, floor, ...rest] = line.split('\t');
      if (!include || !/^\d+$/.test(floor ?? '') || rest.length > 0) {
        throw new Error(
          `lanes-coverage-floors.txt: malformed row ${JSON.stringify(line)}`
        );
      }
      return { include, floor: Number(floor) };
    })
);

/**
 * Deterministic matrix shard of the structural command pool for the
 * ci-fast (structural core) legs. Round-robin by list position keeps each
 * shard's long-pole mix even without measured per-command durations; the
 * per-shard timing table provides the data if a rebalance is ever needed.
 * The union of shards 1..n is exactly the input, in order, with no overlap.
 * Invalid specs throw so a typo fails the lane closed instead of silently
 * running nothing.
 * @param {readonly string[]} parts
 * @param {string} spec — "k/n", 1-based
 */
export function selectStructuralShard(parts, spec) {
  const match = /^(\d+)\/(\d+)$/.exec(String(spec ?? '').trim());
  const index = match ? Number(match[1]) : Number.NaN;
  const total = match ? Number(match[2]) : Number.NaN;
  if (
    !match ||
    !Number.isInteger(index) ||
    !Number.isInteger(total) ||
    total < 1 ||
    index < 1 ||
    index > total
  ) {
    throw new Error(
      `CI_FAST_STRUCTURAL_SHARD must be "k/n" with 1 <= k <= n; got ${JSON.stringify(spec)}`
    );
  }
  return parts.filter((_, position) => position % total === index - 1);
}

/**
 * Retry a lanes pytest shard's failed nodes once, only when one to three
 * nodes failed (a wider failure is a real regression, never retried).
 * Merge-group ejections of unrelated product PRs came from timing-sensitive
 * lanes tests: test_update_installs_tested_release_and_only_moves_the_symlink
 * ejected 7 distinct PRs in 17h, each discarding the groups queued behind it.
 * A deterministic failure fails twice and still fails the shard; a pass on the
 * retry is surfaced as a ::warning naming the node so the flake stays visible.
 * POSIX sh: the shard output goes through a log file because sh has no
 * pipefail. Coverage from the retry appends to the shard's data file.
 */
export const LANES_RETRY_FUNCTION =
  'lanes_retry() { lr_id="$1"; lr_rc="$2"; lr_log="$3"; ' +
  'if [ "$lr_rc" -eq 0 ] || [ "$lr_rc" -eq 5 ]; then return "$lr_rc"; fi; ' +
  'lr_nodes="$(sed -n \'s/^FAILED \\(scripts\\/[^ ]*\\).*/\\1/p\' "$lr_log" | sort -u)"; ' +
  'lr_n="$(printf \'%s\\n\' "$lr_nodes" | grep -c .)"; ' +
  'if [ "$lr_n" -lt 1 ] || [ "$lr_n" -gt 3 ]; then return "$lr_rc"; fi; ' +
  'echo "::warning title=lanes pytest retry::shard $lr_id retried $lr_n failed node(s) once: $(printf \'%s \' $lr_nodes)"; ' +
  'COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-lanes-$lr_id.coverage" python3 -m coverage run -a --branch -m pytest $lr_nodes -q -p no:cacheprovider --basetemp="${RUNNER_TEMP:-/tmp}/jovie-lanes-pytest-$lr_id-retry"; }; ';

/** @param {{ id: string, files: readonly string[], keyword?: string }} shard */
const lanesCoverageShard = ({ id, files, keyword }) =>
  `{ lanes_log="\${RUNNER_TEMP:-/tmp}/jovie-lanes-${id}.log"; PYTEST_ADDOPTS=-rf COVERAGE_FILE="\${RUNNER_TEMP:-/tmp}/jovie-lanes-${id}.coverage" python3 -m coverage run --branch -m pytest ${files.join(' ')} -q -p no:cacheprovider --basetemp="\${RUNNER_TEMP:-/tmp}/jovie-lanes-pytest-${id}"${keyword ? ` -k "${keyword}"` : ''} > "$lanes_log" 2>&1; lanes_rc=$?; cat "$lanes_log"; lanes_retry ${id} "$lanes_rc" "$lanes_log"; }`;

/**
 * Run one set of lanes coverage shards concurrently, then combine the set's
 * branch maps into one data file. Every background shard is waited on (no
 * short-circuit), so none outlives the command. The first non-zero shard
 * status is the command's status (the qualifiers in automation-verify read
 * pytest/coverage exit codes), and it fails the command before coverage is
 * combined.
 * @param {readonly { id: string, files: readonly string[], keyword?: string }[]} shards
 * @param {string} combinedName — ${RUNNER_TEMP}/<combinedName>.coverage output
 */
export const lanesCoverageRun = (shards, combinedName) => {
  const background = shards.slice(0, -1);
  const last = shards[shards.length - 1];
  return `{ ${LANES_RETRY_FUNCTION}${background.map(shard => `${lanesCoverageShard(shard)} & lanes_${shard.id}=$!;`).join(' ')} ${lanesCoverageShard(last)}; lanes_status=$?; ${background.map(shard => `wait "$lanes_${shard.id}"; lanes_shard=$?; [ "$lanes_status" -ne 0 ] || lanes_status=$lanes_shard;`).join(' ')} (exit "$lanes_status"); } && COVERAGE_FILE="\${RUNNER_TEMP:-/tmp}/${combinedName}.coverage" python3 -m coverage combine ${shards.map(shard => `"\${RUNNER_TEMP:-/tmp}/jovie-lanes-${shard.id}.coverage"`).join(' ')}`;
};

/** Files of the lanes coverage suite (one coverage map, sharded below). */
export const LANES_PYTEST_FILES = Object.freeze(
  'scripts/tests/test_factory_signals.py scripts/tests/test_factory_intake.py scripts/tests/test_backlog_admission.py scripts/tests/test_backlog_writer_guard.py scripts/tests/test_board_intake.py scripts/tests/test_capacity_limit.py scripts/tests/test_claude_lane.py scripts/tests/test_cloud_lane.py scripts/tests/test_codex_lane.py scripts/tests/test_conftest_host_isolation.py scripts/tests/test_continuity_clock.py scripts/tests/test_design_gate.py scripts/tests/test_devin_free_policy.py scripts/tests/test_disk_guard.py scripts/tests/test_doctor.py scripts/tests/test_public_feed.py scripts/tests/test_health_checks.py scripts/tests/test_main_health.py scripts/tests/test_epics.py scripts/tests/test_fix_red_statement_merge.py scripts/tests/test_execution_attempt.py scripts/tests/test_gh_app_token.py scripts/tests/test_hud.py scripts/tests/test_hyperagent_cli.py scripts/tests/test_hyperagent_lane.py scripts/tests/test_issue_routing.py scripts/tests/test_lane_runner.py scripts/tests/test_model_families.py scripts/tests/test_model_pools.py scripts/tests/test_model_pool_guard.py scripts/tests/test_model_pool_calls.py scripts/tests/test_model_radar.py scripts/tests/test_pr_events.py scripts/tests/test_pr_events_repair_evidence.py scripts/tests/test_pr_events_red_repair.py scripts/tests/test_pr_body_markup.py scripts/tests/test_priority_admission.py scripts/tests/test_qualification_guard.py scripts/tests/test_reason_lane.py scripts/tests/test_remediation.py scripts/tests/test_repair_order.py scripts/tests/test_repair_win.py scripts/tests/test_service_census.py scripts/tests/test_shipping_attribution.py scripts/tests/test_shipping_origin.py scripts/tests/test_telegram_archive.py scripts/tests/test_worktree_pool.py scripts/tests/test_worktree_sweep.py'.split(
    ' '
  )
);

/**
 * The lanes coverage pytest is ci-fast (remaining)'s long pole: 308.5s of
 * the job's 5.2 min in merge group 39479966697 (2026-10-20). The old split
 * (`-k UpdateTest` vs the rest) had drifted to ~5% / ~95% of the suite as it
 * grew, so the second shard ran almost serially. Four concurrent shards on
 * the 4 vCPU runner, balanced on a serial --durations run (378s local):
 *  - a / b: test_lane_runner.py (138s) with `-k EXPR` and `-k "not (EXPR)"`
 *    over that one file, so each of its tests runs exactly once. EXPR names
 *    its four slowest classes (~83s); a rename that empties shard a fails it
 *    (pytest exit 5).
 *  - c / d: every other file exactly once. Measured concurrently (4 shards,
 *    2026-10-20): a 111s, b 88s, c 140s, d 179s before test_worktree_pool.py
 *    moved to c; serial was 405s.
 * `coverage combine` merges the four branch-coverage maps before the
 * unchanged per-module thresholds read them.
 */
export const LANES_PYTEST_SHARD_EXPRESSION =
  'DependencyOnlyGateTest or RunAgentTest or PreservedRecoveryTest or UpdateTest';

const LANES_RUNNER_FILE = 'scripts/tests/test_lane_runner.py';
const LANES_SHARD_C_FILES = Object.freeze([
  'scripts/tests/test_remediation.py',
  'scripts/tests/test_execution_attempt.py',
  'scripts/tests/test_codex_lane.py',
  'scripts/tests/test_worktree_sweep.py',
  'scripts/tests/test_worktree_pool.py',
]);

/** @type {ReadonlyArray<{ id: string, files: readonly string[], keyword?: string }>} */
export const LANES_PYTEST_SHARDS = Object.freeze([
  {
    id: 'a',
    files: [LANES_RUNNER_FILE],
    keyword: LANES_PYTEST_SHARD_EXPRESSION,
  },
  {
    id: 'b',
    files: [LANES_RUNNER_FILE],
    keyword: `not (${LANES_PYTEST_SHARD_EXPRESSION})`,
  },
  { id: 'c', files: LANES_SHARD_C_FILES },
  {
    id: 'd',
    files: LANES_PYTEST_FILES.filter(
      file => file !== LANES_RUNNER_FILE && !LANES_SHARD_C_FILES.includes(file)
    ),
  },
]);
