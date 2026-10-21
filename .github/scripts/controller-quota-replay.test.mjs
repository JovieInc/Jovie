import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  buildStageEvents,
  classifyFailure,
  computeWaitSeconds,
  DEFAULTS,
  decideReplay,
  defaultLiveSha,
  defaultSleep,
  renderSummary,
  runCli,
  runReplay,
} from './controller-quota-replay.mjs';

const MAIN = 'b'.repeat(40);
const LIVE = 'a'.repeat(40);
const T0 = Date.parse('2026-10-21T08:19:30Z');
const run = (extra = {}) => ({
  id: 39567203920,
  // The real event: name is the run-name title, path identifies the workflow.
  name: '0d9d7e33af62689ccf7d3ec14011bab5c4dd19ab from CI 39621392739 attempt 1',
  path: '.github/workflows/staging-controller.yml',
  run_attempt: 1,
  conclusion: 'failure',
  status: 'completed',
  head_branch: 'main',
  updated_at: '2026-10-21T08:19:20Z',
  html_url: 'https://github.com/JovieInc/Jovie/actions/runs/39567203920',
  ...extra,
});
// The 2026-10-21 08:18:59Z authorize-staging failure, verbatim.
const QUOTA_LOG =
  'Failed to fetch a valid manifest after 3 attempts. Last error: API rate limit exceeded for installation. If you reach out to GitHub Support';

describe('classifyFailure', () => {
  it('recognizes the installation quota failure that stalled production', () => {
    assert.deepEqual(classifyFailure([QUOTA_LOG]), ['quota']);
  });
  it('recognizes the lineage gate fail-closed messages from #22409', () => {
    assert.deepEqual(
      classifyFailure([
        '::error::Release ancestry is unknown (exit=1); inspect',
      ]),
      ['quota']
    );
    assert.deepEqual(
      classifyFailure(['Release successor lookup is unknown (exit=1)']),
      ['quota']
    );
  });
  it('recognizes upstream 5xx, network and runner loss', () => {
    assert.deepEqual(
      classifyFailure([
        'gh: HTTP 502',
        'curl: (6) Could not resolve host: api.github.com',
        'The runner has received a shutdown signal.',
      ]),
      ['network', 'runner-lost', 'upstream-5xx']
    );
  });
  it('treats ordinary red checks as deterministic', () => {
    assert.deepEqual(
      classifyFailure([
        'Generate Screenshots is unhealthy',
        'Expected 3 to equal 4',
        null,
      ]),
      []
    );
  });
});

describe('computeWaitSeconds', () => {
  const nowSeconds = Math.floor(T0 / 1000);
  it('waits out the quota window when remaining is below the floor', () => {
    const wait = computeWaitSeconds({
      attempt: 1,
      rateLimit: { remaining: 0, reset: nowSeconds + 1500 },
      nowSeconds,
    });
    assert.equal(wait, 1500 + DEFAULTS.resetSlackSeconds);
  });
  it('uses exponential backoff when quota is healthy', () => {
    const healthy = { remaining: 900, reset: nowSeconds + 100 };
    assert.equal(
      computeWaitSeconds({ attempt: 1, rateLimit: healthy, nowSeconds }),
      120
    );
    assert.equal(
      computeWaitSeconds({ attempt: 2, rateLimit: healthy, nowSeconds }),
      240
    );
    assert.equal(
      computeWaitSeconds({ attempt: 2, rateLimit: null, nowSeconds }),
      240
    );
  });
  it('gives up when the reset is beyond the wait cap', () => {
    assert.equal(
      computeWaitSeconds({
        attempt: 1,
        rateLimit: { remaining: 3, reset: nowSeconds + 7200 },
        nowSeconds,
      }),
      null
    );
  });
  it('never waits a negative time for a reset already passed', () => {
    assert.equal(
      computeWaitSeconds({
        attempt: 1,
        rateLimit: { remaining: 0, reset: nowSeconds - 600 },
        nowSeconds,
      }),
      120
    );
  });
});

describe('decideReplay', () => {
  const base = {
    run: run(),
    runs: [run()],
    transientKinds: ['quota'],
    liveSha: LIVE,
    mainSha: MAIN,
  };
  it('replays the newest transient failure while production lags main', () => {
    const decision = decideReplay(base);
    assert.equal(decision.replay, true);
    assert.match(decision.reason, /quota/);
  });
  it('ignores successes, cancellations and non-main runs', () => {
    assert.equal(
      decideReplay({ ...base, run: run({ conclusion: 'success' }) }).replay,
      false
    );
    assert.equal(
      decideReplay({ ...base, run: run({ conclusion: 'cancelled' }) }).replay,
      false
    );
    assert.equal(
      decideReplay({ ...base, run: run({ head_branch: 'feature' }) }).replay,
      false
    );
    assert.equal(
      decideReplay({ ...base, run: run({ conclusion: 'timed_out' }) }).replay,
      true
    );
  });
  it('stops at the attempt cap and records the stop as failed', () => {
    const decision = decideReplay({ ...base, run: run({ run_attempt: 3 }) });
    assert.equal(decision.replay, false);
    assert.equal(decision.outcome, 'failed');
    assert.match(decision.reason, /3\/3/);
  });
  it('never retries a deterministic failure', () => {
    const decision = decideReplay({ ...base, transientKinds: [] });
    assert.equal(decision.replay, false);
    assert.match(decision.reason, /deterministic/);
  });
  it('yields to a newer run that ran or is running, not to skipped duplicates', () => {
    const newerRunning = {
      id: run().id + 5,
      status: 'in_progress',
      conclusion: null,
    };
    const newerSkipped = {
      id: run().id + 6,
      status: 'completed',
      conclusion: 'skipped',
    };
    const newerCancelled = {
      id: run().id + 7,
      status: 'completed',
      conclusion: 'cancelled',
    };
    assert.equal(
      decideReplay({ ...base, runs: [run(), newerSkipped, newerCancelled] })
        .replay,
      true
    );
    const decision = decideReplay({
      ...base,
      runs: [run(), newerSkipped, newerRunning],
    });
    assert.equal(decision.replay, false);
    assert.match(decision.reason, new RegExp(String(newerRunning.id)));
  });
  it('does nothing when production already serves main', () => {
    const decision = decideReplay({ ...base, liveSha: MAIN });
    assert.equal(decision.replay, false);
    assert.match(decision.reason, /already serves main/);
  });
});

describe('buildStageEvents', () => {
  it('emits blocked then replayed for a replay', () => {
    const events = buildStageEvents({
      workflow: 'staging-controller.yml',
      run: run(),
      decision: { replay: true, outcome: 'advanced' },
      decidedAt: '2026-10-21T09:00:30Z',
      replayedAt: '2026-10-21T09:00:31Z',
    });
    assert.deepEqual(
      events.map(e => [e.stage, e.outcome, e.entityId]),
      [
        ['blocked', 'advanced', 'staging-controller.yml#39567203920@1'],
        ['replayed', 'completed', 'staging-controller.yml#39567203920@1'],
      ]
    );
    assert.equal(events[0].enteredAt, '2026-10-21T08:19:20Z');
    assert.equal(events[0].exitedAt, '2026-10-21T09:00:30Z');
    assert.ok(
      events.every(
        e =>
          e.schema === 'jovie-stage-event/v1' &&
          e.entityType === 'release-replay'
      )
    );
  });
  it('emits only blocked with the decision outcome when not replayed', () => {
    const events = buildStageEvents({
      workflow: 'production-controller.yml',
      run: run({ html_url: undefined }),
      decision: { replay: false, outcome: 'failed' },
      decidedAt: '2026-10-21T09:00:30Z',
    });
    assert.equal(events.length, 1);
    assert.equal(events[0].outcome, 'failed');
    assert.equal(events[0].sourceReceipt, 'run:39567203920');
  });
  it('records a failed rerun request as failed', () => {
    const events = buildStageEvents({
      workflow: 'staging-controller.yml',
      run: run(),
      decision: { replay: true, outcome: 'advanced' },
      decidedAt: '2026-10-21T09:00:30Z',
      replayedAt: null,
    });
    assert.deepEqual(
      events.map(e => [e.stage, e.outcome]),
      [['blocked', 'failed']]
    );
  });
});

/** Fake gh: answers the calls runReplay makes and records them. */
function fakeGh({
  remaining = 0,
  reset,
  logs = [QUOTA_LOG],
  runs = [run()],
  rerunFails = false,
} = {}) {
  const calls = [];
  const gh = args => {
    calls.push(args);
    const [cmd, path] = args;
    if (cmd === 'run' && path === 'rerun') {
      if (rerunFails) throw new Error('HTTP 403: Resource not accessible');
      return '';
    }
    if (path === 'rate_limit')
      return JSON.stringify({ resources: { core: { remaining, reset } } });
    if (path.includes('/attempts/')) {
      return JSON.stringify({
        jobs: [
          { id: 11, conclusion: 'failure' },
          { id: 12, conclusion: 'success' },
          { id: 13, conclusion: 'failure' },
        ],
      });
    }
    if (path.endsWith('/jobs/11/logs')) return logs[0] ?? '';
    if (path.endsWith('/jobs/13/logs')) {
      const error = new Error('gh failed');
      error.stderr = logs[1] ?? 'HTTP 404';
      throw error;
    }
    if (path.includes('/workflows/'))
      return JSON.stringify({ workflow_runs: runs });
    if (path.endsWith('/commits/main')) return `${MAIN}\n`;
    throw new Error(`unexpected gh call ${args.join(' ')}`);
  };
  return { gh, calls };
}

describe('runReplay', () => {
  const event = { workflow_run: run() };
  const deps = (gh, slept) => ({
    repository: 'JovieInc/Jovie',
    gh,
    sleep: async seconds => slept.push(seconds),
    now: () => T0,
    liveSha: async () => LIVE,
  });

  it('waits for the quota reset, then reruns the failed jobs once', async () => {
    const slept = [];
    const { gh, calls } = fakeGh({ reset: Math.floor(T0 / 1000) + 600 });
    const result = await runReplay({ event, ...deps(gh, slept) });
    assert.deepEqual(slept, [600 + DEFAULTS.resetSlackSeconds]);
    assert.equal(result.decision.replay, true);
    assert.deepEqual(result.decision.transientKinds, ['quota']);
    assert.deepEqual(calls.at(-1), [
      'run',
      'rerun',
      '39567203920',
      '--failed',
      '--repo',
      'JovieInc/Jovie',
    ]);
    assert.deepEqual(
      result.events.map(e => e.stage),
      ['blocked', 'replayed']
    );
    // rate_limit is read before any quota-consuming call.
    assert.deepEqual(calls[0], ['api', 'rate_limit']);
  });

  it('skips without API calls when the attempt cap is reached', async () => {
    const slept = [];
    const { gh, calls } = fakeGh();
    const result = await runReplay({
      event: { workflow_run: run({ run_attempt: 3 }) },
      ...deps(gh, slept),
    });
    assert.equal(result.decision.replay, false);
    assert.equal(calls.length, 0);
    assert.deepEqual(
      result.events.map(e => [e.stage, e.outcome]),
      [['blocked', 'failed']]
    );
  });

  it('gives up when the quota reset is beyond the cap', async () => {
    const slept = [];
    const { gh, calls } = fakeGh({ reset: Math.floor(T0 / 1000) + 9000 });
    const result = await runReplay({ event, ...deps(gh, slept) });
    assert.equal(result.decision.replay, false);
    assert.match(result.decision.reason, /beyond the wait cap/);
    assert.equal(slept.length, 0);
    assert.equal(calls.length, 1);
  });

  it('does not rerun a deterministic failure', async () => {
    const slept = [];
    const { gh, calls } = fakeGh({
      remaining: 900,
      reset: 0,
      logs: ['Expected 3 to equal 4', 'HTTP 404'],
    });
    const result = await runReplay({ event, ...deps(gh, slept) });
    assert.equal(result.decision.replay, false);
    assert.ok(!calls.some(args => args[0] === 'run'));
    assert.deepEqual(slept, [120]);
  });

  it('records a rejected rerun request', async () => {
    const slept = [];
    const { gh } = fakeGh({ remaining: 900, reset: 0, rerunFails: true });
    const result = await runReplay({ event, ...deps(gh, slept) });
    assert.match(result.decision.reason, /rerun request failed/);
    assert.deepEqual(
      result.events.map(e => [e.stage, e.outcome]),
      [['blocked', 'failed']]
    );
  });

  it('ignores workflows it does not own', async () => {
    const result = await runReplay({
      event: {
        workflow_run: run({ name: 'CI', path: '.github/workflows/ci.yml' }),
      },
      repository: 'x/y',
    });
    assert.equal(result.decision.replay, false);
    assert.deepEqual(result.events, []);
  });
});

describe('runCli', () => {
  it('writes NDJSON stage events, the decision and a step summary', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'replay-'));
    const eventPath = join(dir, 'event.json');
    writeFileSync(
      eventPath,
      JSON.stringify({
        workflow_run: run({
          name: 'Production Controller 43b6d22 from CI 1 attempt 1',
          path: '.github/workflows/production-controller.yml',
        }),
      })
    );
    const summary = join(dir, 'summary.md');
    const { gh } = fakeGh({ remaining: 900, reset: 0 });
    const slept = [];
    await runCli({
      env: {
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_REPOSITORY: 'JovieInc/Jovie',
        GITHUB_STEP_SUMMARY: summary,
        REPLAY_EVENTS_PATH: join(dir, 'out', 'stage-events.ndjson'),
      },
      deps: {
        gh,
        sleep: async s => slept.push(s),
        now: () => T0,
        liveSha: async () => LIVE,
      },
    });
    const rows = readFileSync(join(dir, 'out', 'stage-events.ndjson'), 'utf8')
      .trim()
      .split('\n')
      .map(JSON.parse);
    assert.deepEqual(
      rows.map(r => r.entityId),
      [
        'production-controller.yml#39567203920@1',
        'production-controller.yml#39567203920@1',
      ]
    );
    const decision = JSON.parse(
      readFileSync(join(dir, 'out', 'decision.json'), 'utf8')
    );
    assert.equal(decision.schema, 'jovie-controller-replay/v1');
    assert.equal(decision.replay, true);
    assert.match(readFileSync(summary, 'utf8'), /Decision: \*\*replayed\*\*/);
  });

  it('renders a skip summary', () => {
    const text = renderSummary({
      run: run(),
      decision: { replay: false, reason: 'cap' },
    });
    assert.match(text, /not replayed/);
  });
});

describe('io defaults', () => {
  it('reads the live production SHA and treats anything else as unknown', async () => {
    const ok = async () => ({
      ok: true,
      json: async () => ({ commitSha: MAIN }),
    });
    assert.equal(await defaultLiveSha('u', ok), MAIN);
    const short = async () => ({
      ok: true,
      json: async () => ({ commitSha: 'abc' }),
    });
    assert.equal(await defaultLiveSha('u', short), '');
    const down = async () => ({ ok: false });
    assert.equal(await defaultLiveSha('u', down), '');
    const throws = async () => {
      throw new Error('ECONNRESET');
    };
    assert.equal(await defaultLiveSha('u', throws), '');
  });
  it('sleeps for the requested seconds', async () => {
    const started = Date.now();
    await defaultSleep(0.01);
    assert.ok(Date.now() - started >= 5);
  });
});
