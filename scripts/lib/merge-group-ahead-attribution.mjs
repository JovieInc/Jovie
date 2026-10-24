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
