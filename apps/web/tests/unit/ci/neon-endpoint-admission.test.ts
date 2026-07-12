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

    expect(creatorCount).toBe(8);
    expect(visualWorkflow).toContain(
      'uses: ./.github/actions/neon-create-branch-with-retry'
    );
    expect(visualWorkflow).toContain('path: apps/web/test-results/');
    expect(visualWorkflow).toContain('if-no-files-found: error');
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
    expect(capacityRetry).toContain(
      'exceeded (the )?limit of concurrently active endpoints'
    );
    expect(capacityRetry).toContain(
      'failed with a non-capacity error; refusing to retry'
    );
    expect(capacityRetry.indexOf('run_reaper')).toBeLessThan(
      capacityRetry.indexOf('sleep "$RETRY_SECONDS"')
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
});
