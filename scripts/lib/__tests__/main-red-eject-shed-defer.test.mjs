// Regression for run 44577317270 (2026-11-19): the installation quota was
// exhausted, gh() failed over to GITHUB_TOKEN, the fallback bucket ALSO shed
// (budget-reserve:core), and the generic `gh ... : stderr` throw redded the
// wake instead of deferring. A shed is transport, not a verdict: the wake
// must defer visibly (exit 75 + a github-quota-deferred warning) and the
// next ejector wake retries (JOV-13073 / JOV-12717).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ghCalls = [];
const SHED = {
  code: 75,
  stdout: '',
  stderr: 'shed (budget-reserve:core)',
  deferred: true,
};

vi.mock('../../../packages/api-client/gh.ts', () => ({
  runGh: vi.fn(async (args, options = {}) => {
    const credential = options?.env?.GH_TOKEN ?? process.env.GH_TOKEN;
    ghCalls.push({ credential, line: args.join(' ') });
    return SHED;
  }),
}));

const { plan } = await import('../../main-red-eject.mjs');

describe('budget-reserve shed defers instead of redding (JOV-13073)', () => {
  beforeEach(() => {
    ghCalls.length = 0;
    process.env.GITHUB_REPOSITORY = 'JovieInc/Jovie';
    process.env.GH_TOKEN = 'installation-token';
    process.env.GH_FALLBACK_TOKEN = 'fallback-token';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GH_FALLBACK_TOKEN;
  });

  it('rejections carry the shed-defer contract after the failover, with a visible warning', async () => {
    const warnings = [];
    const spy = vi
      .spyOn(console, 'error')
      .mockImplementation(line => warnings.push(String(line)));
    const error = await plan({ mode: 'dry' }).then(
      () => null,
      e => e
    );
    spy.mockRestore();
    // The first shed failed over to the fallback credential (shared budget
    // doctrine: try the other bucket before deferring)...
    expect(ghCalls.length).toBeGreaterThanOrEqual(2);
    expect(ghCalls[0].credential).toBe('installation-token');
    expect(ghCalls[1].credential).toBe('fallback-token');
    // ...and the deferred result became a shed-defer error, not a red throw.
    expect(error?.name).toBe('GithubShedDeferError');
    expect(error?.code).toBe('github_shed_deferred');
    expect(error?.deferred).toBe(true);
    expect(error?.exitCode).toBe(75);
    expect(error?.message).toContain('shed (budget-reserve:core)');
    // The deferral is visible in the run log, the repo's defer convention.
    expect(
      warnings.some(line => line.includes('::warning::github-quota-deferred:'))
    ).toBe(true);
    expect(
      warnings.some(line => line.includes('not a verdict on this change'))
    ).toBe(true);
  });

  it('defers even without a fallback token (no failover possible)', async () => {
    delete process.env.GH_FALLBACK_TOKEN;
    const error = await plan({ mode: 'dry' }).then(
      () => null,
      e => e
    );
    expect(ghCalls).toHaveLength(1);
    expect(error?.deferred).toBe(true);
    expect(error?.exitCode).toBe(75);
  });

  it('a non-deferred gh failure stays a hard error (no silent pass)', async () => {
    const runGh = /** @type {import('vitest').Mock} */ (
      await import('../../../packages/api-client/gh.ts')
    ).runGh;
    runGh.mockImplementationOnce(async () => ({
      code: 1,
      stdout: '',
      stderr: 'gh: HTTP 404 Not Found',
      deferred: false,
    }));
    const error = await plan({ mode: 'dry' }).then(
      () => null,
      e => e
    );
    expect(error?.deferred).toBeUndefined();
    expect(error?.message).toContain('HTTP 404');
  });
});
