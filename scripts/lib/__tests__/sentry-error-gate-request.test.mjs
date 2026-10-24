import { execFile } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  buildAffectedTestPlan,
  buildControlTestCommands,
} from '../../run-affected-tests.mjs';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');

/**
 * Resolve a GNU coreutils-style `timeout` binary for the fixture's child
 * shells. Prefers the Linux name, then the macOS coreutils name
 * (`gtimeout`, Homebrew does not link `timeout` by default). Returns null on
 * hosts that ship neither (stock macOS), where the fixture stages its own
 * bounded shim instead of failing. Results are cached per process.
 *
 * @param {{env?: Record<string, string|undefined>}} [options]
 * @returns {Promise<string|null>}
 */
let cachedGnuTimeoutBinary;
async function resolveGnuTimeoutBinary(options = {}) {
  const probeNames = async () => {
    for (const name of ['timeout', 'gtimeout']) {
      try {
        const found = (
          await exec('bash', ['-c', `command -v ${name}`], {
            ...(options.env ? { env: options.env } : {}),
          })
        ).stdout.trim();
        if (found) return found;
      } catch {
        // Not present under this PATH (stock macOS has no BSD or GNU timeout);
        // keep looking for the coreutils name.
      }
    }
    return null;
  };
  // Explicit-env probes (tests pinning per-environment behavior) bypass the
  // process cache so one host resolution cannot leak across environments.
  if (options.env) return probeNames();
  if (cachedGnuTimeoutBinary === undefined) {
    cachedGnuTimeoutBinary = await probeNames();
  }
  return cachedGnuTimeoutBinary;
}

/**
 * Build the fixture `timeout` script staged on the probe PATH. With a backing
 * GNU timeout binary this is a pass-through (optionally accelerated so unit CI
 * does not wait 55s); without one it is a pure-bash shim implementing exactly
 * the subset `.github/scripts/sentry-read-json.sh` and the action steps use:
 * `timeout --signal=TERM --kill-after=Ns DURATION command...`, with GNU exit
 * semantics (124 when the deadline fires). Durations pass through unchanged —
 * no deadline is relaxed.
 *
 * @param {{backing: string|null, accelerate?: boolean}} options
 * @returns {string}
 */
function buildFixtureTimeoutShim({ backing, accelerate = false }) {
  if (backing) {
    if (!accelerate) {
      return `#!/bin/bash\nexec '${backing}' "$@"\n`;
    }
    return [
      '#!/bin/bash',
      'args=("$@")',
      '[ "$3" = 55s ] || exit 90',
      'args[2]=0.2s',
      `exec '${backing}' "\${args[@]}"`,
      '',
    ].join('\n');
  }
  return `#!/bin/bash
# Fixture-only portable stand-in for GNU coreutils timeout, used when the host
# ships neither timeout nor gtimeout (stock macOS). Covers the exact subset the
# Sentry helper uses. Orphaned watcher sleeps die on their own; the watcher is
# always killed before this shim exits, so it never signals a recycled pid.
signal=TERM
kill_after=1
duration=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --signal=*) signal="\${1#--signal=}"; shift ;;
    --kill-after=*) kill_after="\${1#--kill-after=}"; kill_after="\${kill_after%s}"; shift ;;
    --*) shift ;;
    *) duration="$1"; shift; break ;;
  esac
done
${
  accelerate
    ? '[ "$duration" = 55s ] || exit 90\nduration=0.2'
    : ': # pass the real duration through unchanged'
}
duration="\${duration%s}"
[ -n "$duration" ] || exit 125
"$@" &
child=$!
fired="$(mktemp)"
# The watcher's stdio is detached so a killed watcher's orphaned sleep cannot
# hold the caller's output pipes open after this shim exits.
(
  sleep "$duration"
  echo fired > "$fired"
  kill "-$signal" "$child" 2>/dev/null
  sleep "$kill_after"
  kill -KILL "$child" 2>/dev/null
) </dev/null >/dev/null 2>&1 &
watcher=$!
wait "$child"
status=$?
# The fired marker is written at the deadline, before the signal lands, so
# reading it after the child exits decides the path without racing the
# watcher's grace sleep.
if [ -s "$fired" ]; then
  rm -f "$fired"
  exit 124
fi
rm -f "$fired"
kill -KILL "$watcher" 2>/dev/null
wait "$watcher" 2>/dev/null
exit "$status"
`;
}
const helper = resolve(root, '.github/scripts/sentry-read-json.sh');
/** @typedef {{runs: {steps: Array<{id: string, run: string}>}}} SentryAction */
const action = /** @type {SentryAction} */ (
  load(
    readFileSync(
      resolve(root, '.github/actions/sentry-error-gate/action.yml'),
      'utf8'
    )
  )
);

describe('single-document Sentry evidence', () => {
  async function bodyProbe(body, command) {
    const scratch = mkdtempSync(join(tmpdir(), 'sentry-json-document-'));
    const fixture = join(scratch, 'response.json');
    writeFileSync(fixture, body);
    try {
      await stageFixtureTimeoutBin(join(scratch, 'bin'));
      return {
        status: 0,
        ...(await exec('bash', ['-c', command, 'fixture', helper, fixture], {
          cwd: root,
          timeout: 5000,
          env: {
            ...process.env,
            PATH: `${join(scratch, 'bin')}:${process.env.PATH}`,
          },
        })),
      };
    } catch (error) {
      return { status: error.code, stdout: error.stdout, stderr: error.stderr };
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }

  it.each(['', 'not JSON', '{}\n{"id":"123"}', '{"id":"123"}\n{"id":"123"}'])(
    'refuses ambiguous transport JSON %s before emitting a body',
    async body => {
      const result = await bodyProbe(
        body,
        'source "$1"; sentry_read_json "file://$2"'
      );
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe('');
    }
  );

  it('emits one successfully parsed response without changing its body', async () => {
    const result = await bodyProbe(
      '{"id":"123"}',
      'source "$1"; sentry_read_json "file://$2"'
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('{"id":"123"}');
  });

  it.each(['{"data":[]}', '{"data":[[3600,[{"count":0}]]]}'])(
    'refuses a first document %s followed by valid zero-series evidence',
    async first => {
      const result = await bodyProbe(
        `${first}\n{"data":[[3600,[{"count":0}]]]}`,
        'source "$1"; sentry_error_count "$(cat "$2")" 3600 3660'
      );
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe('');
    }
  );
});

/**
 * Stage the fixture `timeout` bin directory used by both probe styles so the
 * sourced helper and action steps resolve a working GNU-timeout on any host
 * (Linux: pass-through; macOS coreutils: gtimeout; stock macOS: bounded
 * pure-bash shim). Returns the backing binary that was found, if any.
 *
 * @param {string} binDir
 * @param {{accelerate?: boolean, gnuTimeoutBinary?: string|null}} [options]
 * @returns {Promise<string|null>}
 */
async function stageFixtureTimeoutBin(
  binDir,
  { accelerate = false, gnuTimeoutBinary } = {}
) {
  mkdirSync(binDir, { recursive: true });
  const backing =
    gnuTimeoutBinary === undefined
      ? await resolveGnuTimeoutBinary()
      : gnuTimeoutBinary;
  writeFileSync(
    join(binDir, 'timeout'),
    buildFixtureTimeoutShim({ backing, accelerate }),
    { mode: 0o755 }
  );
  return backing;
}

/**
 * @param {Array<{status: number, body?: string, headers?: Record<string, string>}>} responses
 * @param {{stepId?: string, shortDeadline?: boolean, gnuTimeoutBinary?: string|null}} [options]
 */
async function configurationProbe(
  responses,
  { stepId = 'sentry-config', shortDeadline = false, gnuTimeoutBinary } = {}
) {
  const requests = [];
  const scratch = mkdtempSync(join(tmpdir(), 'sentry-gate-read-'));
  const output = join(scratch, 'output');
  const server = createServer((request, response) => {
    requests.push({
      path: request.url,
      authorization: request.headers.authorization,
    });
    const fixture =
      responses[Math.min(requests.length - 1, responses.length - 1)];
    response.writeHead(fixture.status, {
      'Content-Type': 'application/json',
      ...fixture.headers,
    });
    response.end(fixture.body ?? JSON.stringify({ id: '123' }));
  });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolveListen(undefined));
  });
  try {
    const bin = join(scratch, 'bin');
    // Stage a `timeout` for the helper and action steps so every probe works
    // on macOS hosts where GNU timeout is absent or named gtimeout. The
    // accelerated variant swaps the same outer 55s deadline for 0.2s —
    // identical semantics, no waiting 55s in unit CI.
    await stageFixtureTimeoutBin(bin, {
      accelerate: shortDeadline,
      gnuTimeoutBinary,
    });
    const fixturePath = `${bin}:${process.env.PATH}`;
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Sentry fixture requires a bound loopback TCP address');
    }
    const source = action.runs.steps
      .find(step => step.id === stepId)
      .run.replaceAll('https://sentry.io', `http://127.0.0.1:${address.port}`)
      .replaceAll('${{ inputs.soak_minutes }}', '5')
      .replaceAll('${{ inputs.baseline_window_minutes }}', '30')
      .replaceAll('${{ inputs.threshold_multiplier }}', '3')
      .replaceAll('${{ inputs.min_baseline_errors }}', '5')
      .replaceAll('${{ steps.sentry-config.outputs.gate_start_epoch }}', '3600')
      .replaceAll(
        '${{ inputs.expected_sha }}',
        'd54ecb15ce7f3890e80fbf651da193e94753fecc'
      );
    let result;
    try {
      result = {
        status: 0,
        ...(await exec('bash', ['-c', source], {
          cwd: root,
          env: {
            ...process.env,
            SENTRY_AUTH_TOKEN: 'fixture-only',
            SENTRY_ORG: 'jovie',
            SENTRY_PROJECT: 'jovie-web',
            SENTRY_PROJECT_ID: '123',
            CANDIDATE_RELEASE: 'd54ecb15ce7f3890e80fbf651da193e94753fecc',
            PATH: fixturePath,
            GITHUB_OUTPUT: output,
          },
          timeout: 12000,
        })),
      };
    } catch (error) {
      result = {
        status: error.code,
        stdout: error.stdout,
        stderr: error.stderr,
      };
    }
    return {
      ...result,
      requests,
      output: existsSync(output) ? readFileSync(output, 'utf8') : '',
    };
  } finally {
    await new Promise(resolveClose => server.close(resolveClose));
    rmSync(scratch, { recursive: true, force: true });
  }
}

describe('production Sentry project read', () => {
  it('recovers the observed transient 503 without admitting its error body as evidence', async () => {
    const result = await configurationProbe([
      { status: 503, body: '{"id":"wrong"}' },
      { status: 503, body: '{"id":"wrong"}' },
      { status: 200 },
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.requests).toHaveLength(3);
    expect(result.output).toContain('project_id=123\n');
    expect(result.output).not.toContain('wrong');
    expect(
      result.requests.every(
        request =>
          request.path === '/api/0/projects/jovie/jovie-web/' &&
          request.authorization === 'Bearer fixture-only'
      )
    ).toBe(true);
  }, 15000);

  it('exhausts at three attempts and emits no project or observation-window authority', async () => {
    const result = await configurationProbe([{ status: 503 }]);
    expect(result.status).not.toBe(0);
    expect(result.requests).toHaveLength(3);
    expect(result.output).toBe('');
  }, 15000);

  it.each([408, 429, 500, 502, 504])(
    'retries a transient HTTP %i read',
    async status => {
      const result = await configurationProbe([{ status }, { status: 200 }]);
      expect(result.status, result.stderr).toBe(0);
      expect(result.requests).toHaveLength(2);
    }
  );

  it.each([401, 403, 404, 501])(
    'refuses definitive HTTP %i without retry or evidence',
    async status => {
      const result = await configurationProbe([{ status }, { status: 200 }]);
      expect(result.status).not.toBe(0);
      expect(result.requests).toHaveLength(1);
      expect(result.output).toBe('');
    }
  );

  it.each(['not JSON', '{}', '{"id":"not-a-project"}'])(
    'refuses malformed successful response %s',
    async body => {
      const result = await configurationProbe([{ status: 200, body }]);
      expect(result.status).not.toBe(0);
      expect(result.requests).toHaveLength(1);
      expect(result.output).toBe('');
    }
  );

  it('bounds every read and retains the original unknown-result guard', () => {
    const source = readFileSync(helper, 'utf8');
    expect(source).toContain('--connect-timeout 5');
    expect(source).toContain('--max-time 15');
    expect(source).toContain('--retry 2');
    expect(source).toContain('--retry-max-time 40');
    expect(source).toContain('timeout --signal=TERM --kill-after=1s 55s');
    expect(source).not.toContain('--retry-all-errors');
    const resolveGate = action.runs.steps.find(
      step => step.id === 'gate-result'
    ).run;
    expect(resolveGate).toContain('gate_status=error');
    expect(resolveGate).toContain('refusing automatic rollback');
    for (const id of [
      'sentry-config',
      'baseline',
      'post-deploy',
      'candidate-release',
    ]) {
      expect(action.runs.steps.find(step => step.id === id).run).toContain(
        'sentry_read_json'
      );
    }
  });

  it('stops a Retry-After wait at the outer deadline without admitting evidence', async () => {
    const result = await configurationProbe(
      [{ status: 503, headers: { 'Retry-After': '30' } }, { status: 200 }],
      { shortDeadline: true }
    );
    expect(result.status).toBe(124);
    expect(result.requests).toHaveLength(1);
    expect(result.output).toBe('');
  });
});

describe.each(['baseline', 'post-deploy', 'candidate-release'])(
  'Sentry %s time-series evidence',
  stepId => {
    function series(count = 0) {
      const start = stepId === 'baseline' ? 1800 : 3600;
      const minutes = stepId === 'baseline' ? 30 : 5;
      return {
        data: Array.from(
          { length: minutes },
          (_, i) =>
            /** @type {[number, Array<{count?: number}>]} */ ([
              start + i * 60,
              [{ count }],
            ])
        ),
      };
    }
    async function probe(body) {
      return configurationProbe([{ status: 200, body: JSON.stringify(body) }], {
        stepId,
      });
    }
    it('accepts real zero-filled minute buckets without replacing missing data with zero', async () => {
      const result = await probe(series());
      expect(result.status, result.stderr).toBe(0);
      expect(result.output).toBe('error_count=0\n');
      const url = new URL(result.requests[0].path, 'http://fixture');
      expect(url.searchParams.get('interval')).toBe('1m');
      expect(url.searchParams.get('query')).toContain(
        'event.type:error environment:vercel-production'
      );
      expect(url.searchParams.get('query').includes('release:')).toBe(
        stepId === 'candidate-release'
      );
    });
    it('counts validated errors without changing comparison thresholds', async () => {
      const result = await probe(series(2));
      expect(result.status, result.stderr).toBe(0);
      expect(result.output).toBe(
        `error_count=${stepId === 'baseline' ? 60 : 10}\n`
      );
    });
    it('accepts Sentry serializer empty zero-fill buckets only with exact response bounds', async () => {
      const start = stepId === 'baseline' ? 1800 : 3600;
      const end = stepId === 'baseline' ? 3600 : 3900;
      const body = { ...series(), start, end };
      body.data.forEach(row => {
        row[1] = [];
      });
      const result = await probe(body);
      expect(result.status, result.stderr).toBe(0);
      expect(result.output).toBe('error_count=0\n');
    });
    it.each(['start', 'end'])(
      'refuses contradictory response %s even with otherwise complete numeric buckets',
      async bound => {
        const start = stepId === 'baseline' ? 1800 : 3600;
        const end = stepId === 'baseline' ? 3600 : 3900;
        const body = { ...series(), start, end };
        if (bound === 'start') body.start -= 60;
        else body.end += 60;
        const result = await probe(body);
        expect(result.status).not.toBe(0);
        expect(result.output).toBe('');
      }
    );
    it.each([
      'empty',
      'short',
      'stale',
      'duplicate',
      'missing-count',
      'negative',
      'fractional',
      'empty-bucket',
    ])('refuses %s evidence', async kind => {
      const body = series();
      if (kind === 'empty') body.data = [];
      if (kind === 'short') body.data.pop();
      if (kind === 'stale')
        body.data.forEach(row => {
          row[0] -= 60;
        });
      if (kind === 'duplicate') body.data[1][0] = body.data[0][0];
      if (kind === 'missing-count') body.data[0][1] = [{}];
      if (kind === 'negative') body.data[0][1][0].count = -1;
      if (kind === 'fractional') body.data[0][1][0].count = 0.5;
      if (kind === 'empty-bucket') body.data[0][1] = [];
      const result = await probe(body);
      expect(result.status).not.toBe(0);
      expect(result.output).toBe('');
    });
  }
);

it('runs the Sentry regression in normal control CI and the bounded affected selector', () => {
  const path = 'scripts/lib/__tests__/sentry-error-gate-request.test.mjs';
  const control = buildControlTestCommands().map(([command, args]) =>
    [command, ...args].join(' ')
  );
  expect(
    control.some(command =>
      command.includes('lib/__tests__/sentry-error-gate-request.test.mjs')
    )
  ).toBe(true);
  const files = [
    '.github/actions/sentry-error-gate/action.yml',
    '.github/scripts/sentry-read-json.sh',
    path,
    'scripts/run-affected-tests.mjs',
    'docs/runbooks/production-sentry-uncertainty-recovery.md',
  ];
  const plan = buildAffectedTestPlan(files);
  expect(plan.mode).toBe('selected');
  expect(plan.scriptVitestTests).toContain(path);
  expect(
    plan.scriptVitestTests.every(file => existsSync(resolve(root, file)))
  ).toBe(true);
});

describe('portable Sentry fixture timeout', () => {
  async function runShim(shim, args, timeoutMs = 15000) {
    const dir = mkdtempSync(join(tmpdir(), 'fixture-timeout-shim-'));
    try {
      writeFileSync(join(dir, 'timeout'), shim, { mode: 0o755 });
      try {
        const { stdout } = await exec(join(dir, 'timeout'), args, {
          timeout: timeoutMs,
        });
        return { status: 0, stdout };
      } catch (error) {
        return { status: error.code, stdout: error.stdout };
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('resolves no GNU timeout binary when the PATH ships neither name', async () => {
    const emptyBin = mkdtempSync(join(tmpdir(), 'no-gnu-timeout-'));
    try {
      expect(await resolveGnuTimeoutBinary({ env: { PATH: emptyBin } })).toBe(
        null
      );
    } finally {
      rmSync(emptyBin, { recursive: true, force: true });
    }
  });

  it('passes the command exit status through when the deadline does not fire', async () => {
    const shim = buildFixtureTimeoutShim({ backing: null });
    expect(
      await runShim(shim, [
        '--signal=TERM',
        '--kill-after=1s',
        '30s',
        'bash',
        '-c',
        'exit 3',
      ])
    ).toEqual({ status: 3, stdout: '' });
  });

  it('keeps real durations in the pass-through shim and exits 124 at the deadline', async () => {
    const shim = buildFixtureTimeoutShim({ backing: null });
    const startedAt = Date.now();
    const result = await runShim(shim, [
      '--signal=TERM',
      '--kill-after=1s',
      '1s',
      'bash',
      '-c',
      'sleep 10',
    ]);
    expect(result.status).toBe(124);
    expect(Date.now() - startedAt).toBeLessThan(5000);
  });

  it('accelerates only the helper outer 55s guard in the no-binary shim', async () => {
    const shim = buildFixtureTimeoutShim({ backing: null, accelerate: true });
    const startedAt = Date.now();
    const result = await runShim(shim, [
      '--signal=TERM',
      '--kill-after=1s',
      '55s',
      'bash',
      '-c',
      'sleep 60',
    ]);
    expect(result.status).toBe(124);
    expect(Date.now() - startedAt).toBeLessThan(5000);
    expect((await runShim(shim, ['1s', 'bash', '-c', 'exit 0'])).status).toBe(
      90
    );
  });

  it('runs the Retry-After deadline probe without a host GNU timeout binary', async () => {
    const result = await configurationProbe(
      [{ status: 503, headers: { 'Retry-After': '30' } }, { status: 200 }],
      { shortDeadline: true, gnuTimeoutBinary: null }
    );
    expect(result.status, result.stderr).toBe(124);
    expect(result.requests).toHaveLength(1);
    expect(result.output).toBe('');
  });
});
