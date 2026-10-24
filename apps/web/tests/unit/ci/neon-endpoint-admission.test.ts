import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  awaitEndpointTeardown,
  isProvablyOrphaned,
  proveCompletedWorkflowBranch,
  reapCompletedWorkflowBranches,
  sanitizeLegacyHeadBranch,
  workflowRunIdForBranch,
} from '../../../../../scripts/ci/neon-orphan-reaper.mjs';

const repoRoot = resolve(import.meta.dirname, '../../../../..');
const protectedBranches = new Set(['main', 'development']);

describe('Neon endpoint admission', () => {
  it('extracts run IDs only from owned ephemeral branch shapes', () => {
    expect(workflowRunIdForBranch('visual-regression-29202024696')).toBe(
      '29202024696'
    );
    expect(workflowRunIdForBranch('ci-neon-run-29202024722-1')).toBe(
      '29202024722'
    );
    expect(workflowRunIdForBranch('feature-name-29202024722-1')).toBe(
      '29202024722'
    );
    expect(sanitizeLegacyHeadBranch('Gem/Prescope--13826')).toBe(
      'gem-prescope-13826'
    );
    expect(workflowRunIdForBranch('tim-dev')).toBeNull();
    expect(workflowRunIdForBranch('visual-regression-not-a-run')).toBeNull();
  });

  it('requires positive completed-run proof before declaring an orphan', () => {
    const branch = { id: 'br-1', name: 'visual-regression-29202024696' };
    const base = { branch, currentRunId: '29202024722', protectedBranches };

    expect(
      isProvablyOrphaned({
        ...base,
        workflowRun: { id: 29202024696, status: 'completed' },
      })
    ).toBe(true);
    expect(
      isProvablyOrphaned({
        ...base,
        workflowRun: { id: 29202024696, status: 'in_progress' },
      })
    ).toBe(false);
    expect(isProvablyOrphaned({ ...base, workflowRun: null })).toBe(false);
    expect(
      isProvablyOrphaned({
        ...base,
        currentRunId: '29202024696',
        workflowRun: { id: 29202024696, status: 'completed' },
      })
    ).toBe(false);
  });

  it('keeps a shared branch while its owning workflow is active', async () => {
    const request = vi.fn().mockResolvedValue({
      id: 29202024722,
      status: 'in_progress',
      head_branch: 'codex/mobile-overflow',
    });

    const active = await proveCompletedWorkflowBranch({
      branchName: 'ci-neon-run-29202024722-1',
      githubToken: 'github-token',
      repository: 'JovieInc/Jovie',
      currentRunId: '29202029999',
      request,
    });

    expect(active).toEqual({
      proven: false,
      reason: 'owner-not-completed',
    });
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining('/actions/runs/29202024722'),
      expect.anything()
    );
  });

  it('proves a shared branch owner only after its workflow completes', async () => {
    const result = await proveCompletedWorkflowBranch({
      branchName: 'ci-neon-run-29202024722-1',
      githubToken: 'github-token',
      repository: 'JovieInc/Jovie',
      currentRunId: '29202029999',
      request: vi.fn().mockResolvedValue({
        id: 29202024722,
        status: 'completed',
        head_branch: 'codex/mobile-overflow',
      }),
    });

    expect(result).toEqual({ proven: true, reason: 'completed-owner' });
  });

  it('deletes completed-run branches and keeps uncertain or active branches', async () => {
    const request = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.includes('/branches?')) {
        return {
          branches: [
            { id: 'br-done', name: 'visual-regression-29202024696' },
            { id: 'br-live', name: 'e2e-smoke-29202024722-1' },
            { id: 'br-manual', name: 'tim-dev' },
          ],
        };
      }
      if (url.includes('/endpoints?')) {
        return {
          endpoints: [
            { branch_id: 'br-done', current_state: 'active' },
            { branch_id: 'br-live', current_state: 'active' },
          ],
        };
      }
      if (url.endsWith('/actions/runs/29202024696')) {
        return { id: 29202024696, status: 'completed' };
      }
      if (url.includes('/branches/br-done') && options?.method === 'DELETE') {
        return null;
      }
      throw new Error(`unexpected request ${url}`);
    });

    const result = await reapCompletedWorkflowBranches({
      neonApiKey: 'neon-key',
      neonProjectId: 'project',
      githubToken: 'github-token',
      repository: 'JovieInc/Jovie',
      currentRunId: '29202024722',
      protectedBranches,
      request,
      log: vi.fn(),
    });

    expect(result.deleted).toEqual(['visual-regression-29202024696']);
    expect(result.active).toBe(1);
    expect(result.unknown).toBe(0);
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining('/branches/br-done'),
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(request).not.toHaveBeenCalledWith(
      expect.stringContaining('br-live'),
      expect.anything()
    );
  });

  it('fails closed when GitHub ownership proof is unavailable', async () => {
    const request = vi.fn(async (url: string) => {
      if (url.includes('/branches?')) {
        return {
          branches: [
            { id: 'br-unknown', name: 'visual-regression-29202024696' },
          ],
        };
      }
      if (url.includes('/endpoints?')) {
        return {
          endpoints: [{ branch_id: 'br-unknown', current_state: 'active' }],
        };
      }
      throw new Error('GitHub unavailable');
    });

    const result = await reapCompletedWorkflowBranches({
      neonApiKey: 'neon-key',
      neonProjectId: 'project',
      githubToken: 'github-token',
      repository: 'JovieInc/Jovie',
      currentRunId: '29202024722',
      protectedBranches,
      request,
      log: vi.fn(),
    });

    expect(result.deleted).toEqual([]);
    expect(result.skipped).toEqual(['visual-regression-29202024696']);
    expect(result.active).toBe(0);
    expect(result.unknown).toBe(1);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('keeps a legacy numeric branch when the run head does not match its prefix', async () => {
    const request = vi.fn(async (url: string) => {
      if (url.includes('/branches?')) {
        return {
          branches: [
            { id: 'br-arbitrary', name: 'customer-data-29202024696-1' },
          ],
        };
      }
      if (url.includes('/endpoints?')) {
        return {
          endpoints: [{ branch_id: 'br-arbitrary', current_state: 'active' }],
        };
      }
      if (url.endsWith('/actions/runs/29202024696')) {
        return {
          id: 29202024696,
          status: 'completed',
          head_branch: 'codex/unrelated-repair',
        };
      }
      throw new Error(`unexpected request ${url}`);
    });

    const result = await reapCompletedWorkflowBranches({
      neonApiKey: 'neon-key',
      neonProjectId: 'project',
      githubToken: 'github-token',
      repository: 'JovieInc/Jovie',
      currentRunId: '29202024722',
      protectedBranches,
      request,
      log: vi.fn(),
    });

    expect(result.deleted).toEqual([]);
    expect(result.active).toBe(1);
    expect(result.unknown).toBe(0);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('deletes a legacy branch only when its completed run head matches', async () => {
    const request = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.includes('/branches?')) {
        return {
          branches: [
            {
              id: 'br-legacy',
              name: 'gem-prescope-13826-29202843688-1',
            },
          ],
        };
      }
      if (url.includes('/endpoints?')) {
        return {
          endpoints: [{ branch_id: 'br-legacy', current_state: 'active' }],
        };
      }
      if (url.endsWith('/actions/runs/29202843688')) {
        return {
          id: 29202843688,
          status: 'completed',
          head_branch: 'gem/prescope-13826',
        };
      }
      if (url.includes('/branches/br-legacy') && options?.method === 'DELETE') {
        return null;
      }
      throw new Error(`unexpected request ${url}`);
    });

    const result = await reapCompletedWorkflowBranches({
      neonApiKey: 'neon-key',
      neonProjectId: 'project',
      githubToken: 'github-token',
      repository: 'JovieInc/Jovie',
      currentRunId: '29203019846',
      protectedBranches,
      request,
      log: vi.fn(),
    });

    expect(result.deleted).toEqual(['gem-prescope-13826-29202843688-1']);
    expect(result.active).toBe(0);
    expect(result.unknown).toBe(0);
  });

  it('does not charge dormant unknown branches against active endpoint capacity', async () => {
    const request = vi.fn(async (url: string) => {
      if (url.includes('/branches?')) {
        return { branches: [{ id: 'br-dormant', name: 'tim-dev' }] };
      }
      if (url.includes('/endpoints?')) {
        return {
          endpoints: [{ branch_id: 'br-dormant', current_state: 'idle' }],
        };
      }
      throw new Error(`unexpected request ${url}`);
    });

    const result = await reapCompletedWorkflowBranches({
      neonApiKey: 'neon-key',
      neonProjectId: 'project',
      githubToken: 'github-token',
      repository: 'JovieInc/Jovie',
      currentRunId: '29202024722',
      protectedBranches,
      request,
      log: vi.fn(),
    });

    expect(result.deleted).toEqual([]);
    expect(result.active).toBe(0);
    expect(result.unknown).toBe(0);
  });

  it('re-inventories after deletion before admitting endpoint creation', async () => {
    const inventory = vi
      .fn()
      .mockResolvedValueOnce({
        deleted: ['visual-regression-29202024696'],
        active: 0,
        unknown: 0,
      })
      .mockResolvedValueOnce({
        deleted: [],
        active: 2,
        unknown: 0,
      });
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await awaitEndpointTeardown({
      inventory,
      maxAttempts: 3,
      retrySeconds: 15,
      sleep,
      log: vi.fn(),
    });

    expect(inventory).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(15_000);
    expect(result).toEqual({ deleted: [], active: 2, unknown: 0 });
  });

  it.each([0, -1, 1.5, Number.NaN])(
    'fails closed before inventory when teardown attempts are invalid: %s',
    async maxAttempts => {
      const inventory = vi.fn();

      await expect(
        awaitEndpointTeardown({
          inventory,
          maxAttempts,
          retrySeconds: 0,
        })
      ).rejects.toThrow('maxAttempts must be a positive integer');
      expect(inventory).not.toHaveBeenCalled();
    }
  );

  it('emits a fail-closed diagnostic for invalid teardown configuration', () => {
    const result = spawnSync(
      'node',
      [resolve(repoRoot, 'scripts/ci/neon-orphan-reaper.mjs')],
      {
        env: { ...process.env, ADMISSION_ATTEMPTS: '0' },
        encoding: 'utf8',
      }
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Neon orphan reaper failed closed before provider admission'
    );
    expect(result.stderr).toContain('maxAttempts must be a positive integer');
  });

  it('resolves the real admission probe dependency from the web workspace', () => {
    const result = spawnSync(
      'node',
      [resolve(repoRoot, 'scripts/ci/probe-neon-branch.mjs')],
      {
        env: { ...process.env, DATABASE_URL: '' },
        encoding: 'utf8',
      }
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Neon admission probe requires DATABASE_URL.'
    );
    expect(result.stderr).not.toContain('ERR_MODULE_NOT_FOUND');
  });

  it('routes every endpoint creator, including visual regression, through admission', () => {
    const workflows = [
      '.github/workflows/ci.yml',
      '.github/workflows/visual-regression.yml',
      '.github/workflows/e2e-full-matrix.yml',
      '.github/workflows/nightly-tests.yml',
    ].map(path => readFileSync(resolve(repoRoot, path), 'utf8'));

    const creatorCount = workflows.reduce(
      (count, source) =>
        count +
        (source.match(
          /uses: \.\/\.github\/actions\/neon-create-branch-with-retry/g
        )?.length ?? 0),
      0
    );
    const visualWorkflow = workflows[1];
    const action = readFileSync(
      resolve(
        repoRoot,
        '.github/actions/neon-create-branch-with-retry/action.yml'
      ),
      'utf8'
    );
    const capacityRetry = readFileSync(
      resolve(
        repoRoot,
        '.github/actions/neon-create-branch-with-retry/create-branch-with-capacity-retry.sh'
      ),
      'utf8'
    );
    const admissionProbe = readFileSync(
      resolve(repoRoot, 'scripts/ci/probe-neon-branch.mjs'),
      'utf8'
    );
    const admissionWrapper = readFileSync(
      resolve(repoRoot, 'scripts/ci/verify-neon-branch-admission.sh'),
      'utf8'
    );

    // The blocking journey adds one admitted creator to the seven existing lanes.
    expect(creatorCount).toBe(8);
    const journey = workflows[0]
      ?.split('  ci-blocking-golden-path:')[1]
      ?.split('\n  ci-golden-path:')[0];
    expect(journey).toContain(
      'uses: ./.github/actions/neon-create-branch-with-retry'
    );
    expect(journey).toContain("expires_in_hours: '1'");
    expect(journey).toContain(
      'branch_name: golden-path-${{ github.run_id }}-${{ github.run_attempt }}'
    );
    expect(visualWorkflow).toContain(
      'uses: ./.github/actions/neon-create-branch-with-retry'
    );
    // Safe Playwright upload path only — never raw playwright-report HTML.
    expect(visualWorkflow).toContain('path: apps/web/test-results/');
    expect(visualWorkflow).not.toContain('path: apps/web/playwright-report/');
    expect(action).toContain('create-branch-with-capacity-retry.sh');
    expect(action).not.toMatch(/env:\s*\n\s+run:/);
    expect(action).not.toContain('create-branch-attempt-1');
    const createBranch = readFileSync(
      resolve(
        repoRoot,
        '.github/actions/neon-create-branch-with-retry/create-branch.sh'
      ),
      'utf8'
    );
    expect(createBranch).toContain('npx --yes neonctl');
    expect(createBranch).toContain('2>"$CREATE_STDERR"');
    expect(createBranch).not.toContain('"${args[@]}" 2>&1');
    expect(capacityRetry).toContain('NEON_CREATE_ATTEMPTS:-12');
    expect(capacityRetry).toContain('NEON_CREATE_5XX_BACKOFF_SECONDS:-2');
    expect(capacityRetry).toContain('NEON_CREATE_5XX_BACKOFF_CAP_SECONDS:-30');
    expect(capacityRetry).toContain(
      'exceeded (the )?limit of concurrently active endpoints'
    );
    expect(capacityRetry).toContain(
      'HTTP([[:space:]-]+status)?[[:space:]:=-]*5[0-9]{2}([^0-9]|$)'
    );
    expect(capacityRetry).toContain(
      'failed with a non-capacity error; refusing to retry'
    );
    expect(capacityRetry.indexOf('run_reaper')).toBeLessThan(
      capacityRetry.indexOf('sleep "$RETRY_SECONDS"')
    );
    expect(admissionProbe).toContain('SELECT 1 AS ok');
    expect(admissionWrapper).toContain('HTTP([[:space:]-]+status)?');
    expect(admissionWrapper).toContain(
      'You have exceeded the limit of concurrently active endpoints.'
    );
    const cleanupAction = readFileSync(
      resolve(repoRoot, '.github/actions/neon-branch-cleanup/action.yml'),
      'utf8'
    );
    expect(cleanupAction.indexOf('--prove-completed-owner')).toBeLessThan(
      cleanupAction.indexOf('npx neonctl branches delete')
    );
  });

  it('retries the exact live provider capacity error and fails fast otherwise', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'neon-capacity-retry-'));
    const actionPath = resolve(root, 'action');
    const workspace = resolve(root, 'workspace');
    mkdirSync(actionPath, { recursive: true });
    mkdirSync(resolve(workspace, 'scripts/ci'), { recursive: true });
    writeFileSync(
      resolve(workspace, 'scripts/ci/neon-orphan-reaper.mjs'),
      "import { appendFileSync } from 'node:fs'; appendFileSync(process.env.REAPER_LOG, 'reap\\n');\n"
    );
    const createPath = resolve(actionPath, 'create-branch.sh');
    const wrapper = resolve(
      repoRoot,
      '.github/actions/neon-create-branch-with-retry/create-branch-with-capacity-retry.sh'
    );
    const attemptsFile = resolve(root, 'attempts');
    const reaperLog = resolve(root, 'reaper.log');
    const env = {
      ...process.env,
      GITHUB_ACTION_PATH: actionPath,
      GITHUB_WORKSPACE: workspace,
      NEON_CREATE_ATTEMPTS: '2',
      NEON_CREATE_RETRY_SECONDS: '0',
      ATTEMPTS_FILE: attemptsFile,
      REAPER_LOG: reaperLog,
    };

    try {
      writeFileSync(
        createPath,
        `#!/usr/bin/env bash\ncount=$(($(cat "$ATTEMPTS_FILE" 2>/dev/null || echo 0) + 1))\necho "$count" > "$ATTEMPTS_FILE"\nif [ "$count" -eq 1 ]; then echo 'You have exceeded the limit of concurrently active endpoints.' >&2; exit 1; fi\nexit 0\n`
      );
      chmodSync(createPath, 0o755);
      const capacity = spawnSync('bash', [wrapper], { env, encoding: 'utf8' });
      expect(capacity.status).toBe(0);
      expect(readFileSync(attemptsFile, 'utf8').trim()).toBe('2');
      expect(readFileSync(reaperLog, 'utf8').trim().split('\n')).toHaveLength(
        2
      );

      writeFileSync(attemptsFile, '0');
      writeFileSync(
        createPath,
        "#!/usr/bin/env bash\necho 'authentication failed' >&2\nexit 7\n"
      );
      const nonCapacity = spawnSync('bash', [wrapper], {
        env,
        encoding: 'utf8',
      });
      expect(nonCapacity.status).toBe(7);
      expect(nonCapacity.stdout).toContain(
        'non-capacity error; refusing to retry'
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('retries HTTP 5xx with bounded backoff and keeps other 4xx fatal', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'neon-5xx-retry-'));
    const actionPath = resolve(root, 'action');
    const workspace = resolve(root, 'workspace');
    const bin = resolve(root, 'bin');
    mkdirSync(actionPath, { recursive: true });
    mkdirSync(resolve(workspace, 'scripts/ci'), { recursive: true });
    mkdirSync(bin, { recursive: true });
    writeFileSync(
      resolve(workspace, 'scripts/ci/neon-orphan-reaper.mjs'),
      "import { appendFileSync } from 'node:fs'; appendFileSync(process.env.REAPER_LOG, 'reap\\n');\n"
    );
    writeFileSync(
      resolve(bin, 'sleep'),
      '#!/usr/bin/env bash\nprintf "%s\\n" "$1" >> "$SLEEP_LOG"\n'
    );
    chmodSync(resolve(bin, 'sleep'), 0o755);
    const createPath = resolve(actionPath, 'create-branch.sh');
    const wrapper = resolve(
      repoRoot,
      '.github/actions/neon-create-branch-with-retry/create-branch-with-capacity-retry.sh'
    );
    const attemptsFile = resolve(root, 'attempts');
    const reaperLog = resolve(root, 'reaper.log');
    const sleepLog = resolve(root, 'sleep.log');
    const env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      GITHUB_ACTION_PATH: actionPath,
      GITHUB_WORKSPACE: workspace,
      NEON_CREATE_ATTEMPTS: '3',
      NEON_CREATE_RETRY_SECONDS: '15',
      NEON_CREATE_5XX_BACKOFF_SECONDS: '8',
      NEON_CREATE_5XX_BACKOFF_CAP_SECONDS: '10',
      ATTEMPTS_FILE: attemptsFile,
      REAPER_LOG: reaperLog,
      SLEEP_LOG: sleepLog,
    };
    const live502 =
      'ERROR: HTTP 502 Bad Gateway | /api/v2/projects/curly-dew-35158967/branches/br-hidden-pine-adz9relp/databases';

    const run = (script: string) => {
      writeFileSync(attemptsFile, '0');
      writeFileSync(reaperLog, '');
      writeFileSync(sleepLog, '');
      writeFileSync(createPath, script);
      chmodSync(createPath, 0o755);
      return spawnSync('bash', [wrapper], { env, encoding: 'utf8' });
    };

    try {
      const recovered = run(
        `#!/usr/bin/env bash\ncount=$(($(cat "$ATTEMPTS_FILE" 2>/dev/null || echo 0) + 1))\necho "$count" > "$ATTEMPTS_FILE"\nif [ "$count" -eq 1 ]; then echo '${live502}' >&2; exit 1; fi\nexit 0\n`
      );
      expect(recovered.status).toBe(0);
      expect(readFileSync(attemptsFile, 'utf8').trim()).toBe('2');
      expect(readFileSync(reaperLog, 'utf8').trim().split('\n')).toEqual([
        'reap',
      ]);
      expect(readFileSync(sleepLog, 'utf8').trim()).toBe('8');
      expect(recovered.stdout).toContain(
        'returned HTTP 5xx on attempt 1/3; bounded backoff 8s before retry.'
      );

      const capped = run(
        `#!/usr/bin/env bash\ncount=$(($(cat "$ATTEMPTS_FILE" 2>/dev/null || echo 0) + 1))\necho "$count" > "$ATTEMPTS_FILE"\necho 'HTTP status 503' >&2\nexit 1\n`
      );
      expect(capped.status).toBe(1);
      expect(readFileSync(attemptsFile, 'utf8').trim()).toBe('3');
      expect(readFileSync(sleepLog, 'utf8').trim().split('\n')).toEqual([
        '8',
        '10',
      ]);
      expect(readFileSync(reaperLog, 'utf8').trim().split('\n')).toEqual([
        'reap',
      ]);
      expect(capped.stdout).toContain(
        'still returned HTTP 5xx after 3 attempts.'
      );

      for (const fatal of [
        'ERROR: HTTP 400 Bad Request',
        'ERROR: HTTP 404 Not Found',
        'HTTP status 422',
        'HTTP 429 Too Many Requests',
        'HTTP 499',
        'HTTP 5020 is not a three-digit status',
        'authentication failed',
      ]) {
        const result = run(
          `#!/usr/bin/env bash\ncount=$(($(cat "$ATTEMPTS_FILE" 2>/dev/null || echo 0) + 1))\necho "$count" > "$ATTEMPTS_FILE"\necho '${fatal}' >&2\nexit 7\n`
        );
        expect(result.status, fatal).toBe(7);
        expect(readFileSync(attemptsFile, 'utf8').trim(), fatal).toBe('1');
        expect(readFileSync(sleepLog, 'utf8'), fatal).toBe('');
        expect(result.stdout, fatal).toContain(
          'non-capacity error; refusing to retry'
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reaps and retries the same branch only for exact SELECT 1 capacity failures', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'neon-admission-probe-'));
    const connectionFile = resolve(root, 'connection.json');
    const attemptsFile = resolve(root, 'attempts');
    const urlLog = resolve(root, 'urls.log');
    const reaperLog = resolve(root, 'reaper.log');
    const probePath = resolve(root, 'probe.mjs');
    const reaperPath = resolve(root, 'reaper.mjs');
    const wrapper = resolve(
      repoRoot,
      'scripts/ci/verify-neon-branch-admission.sh'
    );
    const databaseUrl = 'postgresql://example.test/db';

    try {
      writeFileSync(
        connectionFile,
        JSON.stringify({ db_url: databaseUrl, branch_name: 'ci-neon-run-42-1' })
      );
      writeFileSync(
        probePath,
        `import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';\nconst path = process.env.ATTEMPTS_FILE;\nconst count = Number(readFileSync(path, 'utf8') || '0') + 1;\nwriteFileSync(path, String(count));\nappendFileSync(process.env.URL_LOG, process.env.DATABASE_URL + '\\n');\nif (count === 1) { console.error('HTTP status 402: You have exceeded the limit of concurrently active endpoints.'); process.exit(1); }\n`
      );
      writeFileSync(
        reaperPath,
        "import { appendFileSync } from 'node:fs'; appendFileSync(process.env.REAPER_LOG, 'reap\\n');\n"
      );
      writeFileSync(attemptsFile, '0');

      const result = spawnSync('bash', [wrapper], {
        env: {
          ...process.env,
          GITHUB_WORKSPACE: repoRoot,
          CONNECTION_FILE: connectionFile,
          NEON_ADMISSION_ATTEMPTS: '2',
          NEON_ADMISSION_RETRY_SECONDS: '0',
          NEON_ADMISSION_PROBE_PATH: probePath,
          NEON_ADMISSION_REAPER_PATH: reaperPath,
          ATTEMPTS_FILE: attemptsFile,
          URL_LOG: urlLog,
          REAPER_LOG: reaperLog,
        },
        encoding: 'utf8',
      });

      expect(result.status).toBe(0);
      expect(readFileSync(attemptsFile, 'utf8')).toBe('2');
      expect(readFileSync(reaperLog, 'utf8').trim()).toBe('reap');
      expect(readFileSync(urlLog, 'utf8').trim().split('\n')).toEqual([
        databaseUrl,
        databaseUrl,
      ]);
      expect(result.stdout).toContain(
        'ci-neon-run-42-1 admitted on SELECT 1 attempt 2/2'
      );

      for (const partialSignature of [
        'You have exceeded the limit of concurrently active endpoints.',
        'HTTP status 402: payment required',
      ]) {
        writeFileSync(
          probePath,
          `console.error('${partialSignature}'); process.exit(9);\n`
        );
        const partial = spawnSync('bash', [wrapper], {
          env: {
            ...process.env,
            GITHUB_WORKSPACE: repoRoot,
            CONNECTION_FILE: connectionFile,
            NEON_ADMISSION_ATTEMPTS: '2',
            NEON_ADMISSION_RETRY_SECONDS: '0',
            NEON_ADMISSION_PROBE_PATH: probePath,
            NEON_ADMISSION_REAPER_PATH: reaperPath,
            REAPER_LOG: reaperLog,
          },
          encoding: 'utf8',
        });
        expect(partial.status).toBe(9);
        expect(partial.stderr).toContain(
          'non-capacity error; refusing to reap or retry'
        );
        expect(readFileSync(reaperLog, 'utf8').trim()).toBe('reap');
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
