// Signature-based attribution for a merge group whose ahead group also failed.
//
// A group's base is the head of the group ahead of it, so a failure here can be
// the ahead entry's. merge-group-failure-hold therefore waits while the ahead
// group has not passed (aheadEntryUnproven). On 2026-10-21 a lanes flake ahead
// (#22328, run 39536019717) hid #22331's own deterministic external-api-guard
// failure (run 39536021794) for several cycles, so the poison kept re-forming
// groups. When the ahead run has COMPLETED, its own results can prove that each
// signal failing here passed (or was not selected) on this group's base. Only
// then is the failure attributable to this group's PR.
//
// Evidence is positive only. The structural lane is fail-fast, so a command
// missing from the ahead run's failures proves nothing: it must appear as `pass`
// in the ahead run's structural timings table. A lane skipped by fail-fast is
// not evidence; a lane skipped because its inputs were not selected is. When
// the ahead run failed in another job and its `ci-fast (remaining)` job
// succeeded, that job's timings table is the strongest form of the same
// evidence — every command passed (JOV-8760).

export const AGGREGATE_JOBS = Object.freeze(
  new Set(['ci-fast', 'Product Lane Receipt', 'PR Ready'])
);
export const CI_FAST_REMAINING_JOB = 'ci-fast (remaining)';

const LANE_HEADER = /^=+ lane: ([\w.-]+) =+$/;
const LANE_STATUS =
  /^\[ci-fast\] ([\w.-]+): (success|failure|skipped|cancelled)\b/;
const FAIL_FAST_SKIP = /^skipped: earlier lane failed/;
const TIMING_ROW = /^\| (\d+) \| [\d.]+s \| (pass|exit -?\d+) \| `(.*)` \|$/;
const STRUCTURAL_FAILURE =
  /Structural command \d+\/\d+ failed \(exit -?\d+\)\. Command: (.+?)(?: \| |$)/;

function stripLogPrefix(line) {
  // gh job logs prefix each line with an ISO timestamp.
  return line
    .replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s/, '')
    .replace(/^##\[error\]/, '');
}

/** Normalize a structural command label so 80- and 100-char renderings compare. */
export function normalizeCommandLabel(label) {
  return String(label ?? '')
    .replaceAll('\\|', '|')
    .replaceAll('`', "'")
    .replace(/…$/u, '')
    .trim();
}

function sameCommand(a, b) {
  const left = normalizeCommandLabel(a);
  const right = normalizeCommandLabel(b);
  if (!left || !right) return false;
  return left.startsWith(right) || right.startsWith(left);
}

/**
 * Parse a `ci-fast (remaining)` job log into lane results and structural
 * command results.
 * @param {string} text
 */
export function parseCiFastLog(text) {
  /** @type {Map<string, { statuses: Set<string>, failFastSkipped: boolean }>} */
  const lanes = new Map();
  const passedCommands = [];
  const failedCommands = [];
  let current = null;
  const lane = name => {
    if (!lanes.has(name))
      lanes.set(name, { statuses: new Set(), failFastSkipped: false });
    return lanes.get(name);
  };
  for (const raw of String(text ?? '').split('\n')) {
    const line = stripLogPrefix(raw.replace(/^[^\t]*\t[^\t]*\t/, '')).trimEnd();
    const header = LANE_HEADER.exec(line);
    if (header) {
      current = lane(header[1]);
      continue;
    }
    if (current && FAIL_FAST_SKIP.test(line)) current.failFastSkipped = true;
    const status = LANE_STATUS.exec(line);
    if (status) lane(status[1]).statuses.add(status[2]);
    const row = TIMING_ROW.exec(line);
    if (row) {
      (row[2] === 'pass' ? passedCommands : failedCommands).push(row[3]);
    }
    const failure = STRUCTURAL_FAILURE.exec(line);
    if (failure) failedCommands.push(failure[1]);
  }
  return { lanes, passedCommands, failedCommands };
}

/** Lanes whose status in this run includes failure (structural handled by commands). */
function failingLanes(parsed) {
  return [...parsed.lanes.entries()]
    .filter(([, value]) => value.statuses.has('failure'))
    .map(([name]) => name);
}

/**
 * @param {{
 *   currentJobs: Array<{ name: string, conclusion: string | null }>,
 *   aheadJobs: Array<{ name: string, conclusion: string | null }>,
 *   aheadConclusion: string | null | undefined,
 *   currentCiFastLog?: string | null,
 *   aheadCiFastLog?: string | null,
 * }} input
 * @returns {{ attributable: boolean, reason: string }}
 */
export function attributeAgainstAheadRun({
  currentJobs,
  aheadJobs,
  aheadConclusion,
  currentCiFastLog,
  aheadCiFastLog,
}) {
  const no = reason => ({ attributable: false, reason });
  if (aheadConclusion !== 'failure')
    return no('ahead-run-not-completed-failure');
  if (!Array.isArray(currentJobs) || !Array.isArray(aheadJobs))
    return no('job-evidence-missing');
  const failed = currentJobs.filter(job =>
    ['failure', 'timed_out', 'cancelled', 'action_required'].includes(
      job?.conclusion
    )
  );
  const substantive = failed.filter(job => !AGGREGATE_JOBS.has(job.name));
  if (substantive.length === 0) return no('no-substantive-failure');
  const aheadByName = new Map(aheadJobs.map(job => [job?.name, job]));
  for (const job of substantive) {
    if (job.conclusion !== 'failure')
      return no(`job-not-a-failure:${job.name}`);
    if (job.name === CI_FAST_REMAINING_JOB) continue;
    if (aheadByName.get(job.name)?.conclusion !== 'success') {
      return no(`job-unproven-on-base:${job.name}`);
    }
  }
  if (!substantive.some(job => job.name === CI_FAST_REMAINING_JOB)) {
    return { attributable: true, reason: 'failed-jobs-passed-on-ahead-run' };
  }
  if (!currentCiFastLog || !aheadCiFastLog) return no('ci-fast-log-missing');
  const current = parseCiFastLog(currentCiFastLog);
  const ahead = parseCiFastLog(aheadCiFastLog);
  const lanes = failingLanes(current);
  if (lanes.length === 0) return no('ci-fast-failure-unparsed');
  for (const name of lanes) {
    if (name === 'structural') {
      if (current.failedCommands.length === 0)
        return no('structural-failure-unparsed');
      for (const command of current.failedCommands) {
        if (
          !ahead.passedCommands.some(passed => sameCommand(passed, command))
        ) {
          return no(
            `structural-command-unproven-on-base:${normalizeCommandLabel(command)}`
          );
        }
      }
      continue;
    }
    const base = ahead.lanes.get(name);
    if (!base) return no(`lane-absent-on-ahead-run:${name}`);
    if (base.statuses.has('failure'))
      return no(`lane-failed-on-ahead-run:${name}`);
    const selectionSkip = base.statuses.has('skipped') && !base.failFastSkipped;
    if (!base.statuses.has('success') && !selectionSkip) {
      return no(`lane-unproven-on-base:${name}`);
    }
  }
  return { attributable: true, reason: 'failing-signals-passed-on-ahead-run' };
}

// Peer recurrence (shadow evidence, canon/MERGE_QUEUE_STEWARD.md invariant 4).
//
// A signal that also failed in a completed merge group that did not contain
// this PR cannot be this PR's doing alone. On 2026-10-31 one ci-fast-lanes
// timeout ejected #23938 (run 41243949300) and #23706 (run 41244978915), two
// groups with no shared entry, and both were held as deterministic-source.
// Evidence is positive only: every failing test of every failed structural
// command must appear, under the same command, in a failed peer group whose
// membership excludes the PR. Unparsed output, other failing jobs or lanes,
// and peers of unknown membership prove nothing.

const STRUCTURAL_COMMAND_FAILED =
  /^Structural command \d+\/\d+ failed \(exit -?\d+\)\. Command: (.+?)(?: \| |$)/;
const VITEST_FAIL = /^FAIL\s+(?:\S+\s+)?(\S+\.test\.[cm]?[jt]sx?) > (.+?)\s*$/;
const NODE_TEST_FRAME =
  /\(file:\/\/\/\S*?\/((?:apps|packages|scripts)\/\S+?\.test\.[cm]?[jt]sx?):(\d+):\d+\)/;
const SEGMENT_END = /^(?:#### Structural command timings|\[ci-fast\] )/;

/**
 * Failing tests per failed structural command in a `ci-fast (remaining)` log.
 * @param {string} text
 * @returns {Array<{ command: string, tests: Set<string> }>}
 */
export function parseFailedSignals(text) {
  /** @type {Array<{ command: string, tests: Set<string> }>} */
  const commands = [];
  let current = null;
  for (const raw of String(text ?? '').split('\n')) {
    const line = stripLogPrefix(raw.replace(/^[^\t]*\t[^\t]*\t/, '')).trim();
    const failed = STRUCTURAL_COMMAND_FAILED.exec(line);
    if (failed) {
      current =
        commands.find(entry => sameCommand(entry.command, failed[1])) ?? null;
      if (!current) {
        current = {
          command: normalizeCommandLabel(failed[1]),
          tests: new Set(),
        };
        commands.push(current);
      }
      continue;
    }
    if (!current) continue;
    if (SEGMENT_END.test(line)) {
      current = null;
      continue;
    }
    const vitest = VITEST_FAIL.exec(line);
    if (vitest) current.tests.add(`${vitest[1]} > ${vitest[2]}`);
    const frame = NODE_TEST_FRAME.exec(line);
    if (frame) current.tests.add(`${frame[1]}:${frame[2]}`);
  }
  return commands;
}

/**
 * @param {{
 *   currentJobs: Array<{ name: string, conclusion: string | null }>,
 *   currentCiFastLog?: string | null,
 *   peers: Array<{ runId: number, conclusion: string | null, containsPr: boolean | null, ciFastLog?: string | null }>,
 * }} input
 * @returns {{ recurring: boolean, reason: string, signals?: string[], peerRunIds?: number[] }}
 */
export function attributeAgainstPeerRuns({
  currentJobs,
  currentCiFastLog,
  peers,
}) {
  const no = reason => ({ recurring: false, reason });
  if (!Array.isArray(currentJobs)) return no('job-evidence-missing');
  const substantive = currentJobs
    .filter(job =>
      ['failure', 'timed_out', 'cancelled', 'action_required'].includes(
        job?.conclusion
      )
    )
    .filter(job => !AGGREGATE_JOBS.has(job.name));
  if (
    substantive.length !== 1 ||
    substantive[0].name !== CI_FAST_REMAINING_JOB ||
    substantive[0].conclusion !== 'failure'
  ) {
    return no(
      `not-structural-only:${substantive.map(job => job.name).join(',') || 'none'}`
    );
  }
  if (!currentCiFastLog) return no('ci-fast-log-missing');
  const lanes = failingLanes(parseCiFastLog(currentCiFastLog));
  if (lanes.length !== 1 || lanes[0] !== 'structural') {
    return no(`not-structural-only:${lanes.join(',') || 'none'}`);
  }
  const current = parseFailedSignals(currentCiFastLog);
  if (current.length === 0) return no('structural-failure-unparsed');
  const unparsed = current.find(entry => entry.tests.size === 0);
  if (unparsed) return no(`failing-tests-unparsed:${unparsed.command}`);
  const witnesses = (Array.isArray(peers) ? peers : [])
    .filter(
      peer =>
        peer?.conclusion === 'failure' &&
        peer.containsPr === false &&
        Number.isSafeInteger(peer.runId) &&
        typeof peer.ciFastLog === 'string'
    )
    .map(peer => ({
      runId: peer.runId,
      signals: parseFailedSignals(peer.ciFastLog),
    }));
  const signals = [];
  const peerRunIds = new Set();
  for (const entry of current) {
    for (const test of entry.tests) {
      const witness = witnesses.find(peer =>
        peer.signals.some(
          signal =>
            sameCommand(signal.command, entry.command) && signal.tests.has(test)
        )
      );
      if (!witness) return no(`signal-not-seen-without-pr:${test}`);
      signals.push(test);
      peerRunIds.add(witness.runId);
    }
  }
  return {
    recurring: true,
    reason: 'failing-signals-recurred-without-pr',
    signals,
    peerRunIds: [...peerRunIds],
  };
}
