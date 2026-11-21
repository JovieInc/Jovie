const REPOSITORY = process.env.GITHUB_REPOSITORY || 'JovieInc/Jovie';

const TALLY_NOTICE =
  /workflow=(.+?) job=(\S+) calls=(\d+) github_token=(\d+) other=(\d+) top=(.*)$/;

/** @param {string} message */
export function parseTallyNotice(message) {
  const match = TALLY_NOTICE.exec(String(message ?? ''));
  if (
    !match ||
    !match.slice(3, 6).every(value => Number.isSafeInteger(Number(value))) ||
    Number(match[3]) !== Number(match[4]) + Number(match[5])
  )
    return null;
  return {
    workflow: match[1],
    job: match[2],
    calls: Number(match[3]),
    githubToken: Number(match[4]),
    other: Number(match[5]),
    top: match[6],
  };
}

/**
 * gh invocations per workflow and job from `gh-tally` job notices: runs, calls and
 * github.token calls, and each job's mean github.token calls per run. `hours` turns
 * the totals into per-hour rates.
 *
 * @param {Array<ReturnType<typeof parseTallyNotice>>} records
 * @param {number} hours
 */
export function summarizeTally(records, hours = 1) {
  const rows = new Map();
  for (const record of records) {
    if (!record) continue;
    const key = `${record.workflow} / ${record.job}`;
    const row = rows.get(key) ?? {
      key,
      runs: 0,
      calls: 0,
      githubToken: 0,
      other: 0,
    };
    row.runs += 1;
    row.calls += record.calls;
    row.githubToken += record.githubToken;
    row.other += record.other;
    rows.set(key, row);
  }
  return [...rows.values()]
    .map(row => ({
      ...row,
      githubTokenPerRun: Math.round((row.githubToken / row.runs) * 10) / 10,
      githubTokenPerHour: Math.round(row.githubToken / hours),
    }))
    .sort(
      (a, b) => b.githubToken - a.githubToken || a.key.localeCompare(b.key)
    );
}

function flag(argv, name, fallback) {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? Number(argv[index + 1]) : fallback;
}

const TALLY_WORKFLOWS = ['lane-fix-relay.yml', 'fleet-rules-evidence.yml'];

/** A bounded, complete-only observation of completed workflow runs. */
export function collectTally(argv, read, nowMs = Date.now()) {
  const hours = flag(argv, 'hours', 1);
  const maxRuns = flag(argv, 'max-runs', 60);
  const maxReads = flag(argv, 'max-reads', 24);
  let reads = 0;
  const fail = reason => {
    throw new Error(reason);
  };
  const result = (complete, reason, records = []) => ({
    hours,
    reads,
    complete,
    reason,
    records,
  });
  if (
    !Number.isFinite(hours) ||
    hours <= 0 ||
    !Number.isSafeInteger(maxRuns) ||
    maxRuns < 1 ||
    !Number.isSafeInteger(maxReads) ||
    maxReads < 1 ||
    maxReads > 96
  )
    return result(false, 'invalid-options');
  const get = path => {
    if (reads >= maxReads) fail('read-budget');
    reads += 1;
    try {
      return read(path);
    } catch {
      return fail('read-failed');
    }
  };
  const pages = function* (path, key) {
    for (let page = 1; ; page += 1) {
      const data = get(
        `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`
      );
      const rows = key ? data?.[key] : data;
      if (!Array.isArray(rows) || rows.length > 100) fail('malformed-response');
      yield* rows;
      if (rows.length < 100) return;
    }
  };
  const validId = value => Number.isSafeInteger(value) && value > 0;
  const records = [];
  try {
    const since = new Date(nowMs - hours * 3600_000).toISOString();
    for (const workflow of TALLY_WORKFLOWS) {
      let runs = 0;
      for (const run of pages(
        `repos/${REPOSITORY}/actions/workflows/${workflow}/runs?created=>=${since}`,
        'workflow_runs'
      )) {
        if (!run || !validId(run.id)) fail('malformed-response');
        if (!run.conclusion || run.conclusion === 'skipped') continue;
        if (++runs > maxRuns) fail('run-limit');
        for (const job of pages(
          `repos/${REPOSITORY}/actions/runs/${run.id}/jobs`,
          'jobs'
        )) {
          if (!job || !validId(job.id)) fail('malformed-response');
          if (job.conclusion === 'skipped') continue;
          for (const annotation of pages(
            `repos/${REPOSITORY}/check-runs/${job.id}/annotations`
          )) {
            if (!annotation || typeof annotation !== 'object')
              fail('malformed-response');
            if (annotation.title !== 'gh-tally') continue;
            const record = parseTallyNotice(annotation.message);
            if (!record) fail('malformed-notice');
            records.push(record);
          }
        }
      }
    }
    return result(true, null, records);
  } catch (error) {
    const known = [
      'read-budget',
      'read-failed',
      'run-limit',
      'malformed-response',
      'malformed-notice',
    ];
    return result(
      false,
      known.includes(error.message) ? error.message : 'malformed-response'
    );
  }
}
