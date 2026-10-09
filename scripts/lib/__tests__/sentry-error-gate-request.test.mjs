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
      return {
        status: 0,
        ...(await exec('bash', ['-c', command, 'fixture', helper, fixture], {
          cwd: root,
          timeout: 5000,
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

/** @param {Array<{status: number, body?: string, headers?: Record<string, string>}>} responses */
async function configurationProbe(
  responses,
  { stepId = 'sentry-config', shortDeadline = false } = {}
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
    let fixturePath = process.env.PATH;
    if (shortDeadline) {
      const actualTimeout = (
        await exec('bash', ['-c', 'command -v timeout'])
      ).stdout.trim();
      const bin = join(scratch, 'bin');
      mkdirSync(bin);
      // Accelerate the same outer timeout instead of waiting 55s in unit CI.
      writeFileSync(
        join(bin, 'timeout'),
        `#!/bin/bash\nargs=("$@")\n[ "$3" = 55s ] || exit 90\nargs[2]=0.2s\nexec '${actualTimeout}' "\${args[@]}"\n`,
        { mode: 0o755 }
      );
      fixturePath = `${bin}:${fixturePath}`;
    }
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
