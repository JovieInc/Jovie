import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkSummerEvePin, main } from './summer-eve-pin-check';
import { SUMMER_PRODUCTION } from './summer-production-identity';

const ID = 'dpl_live';
const TOKEN = 'read-only-token';
const SOURCE_REVISION = 'b'.repeat(40);

function identity(overrides: Record<string, unknown> = {}) {
  return {
    schema: SUMMER_PRODUCTION.identitySchema,
    id: SUMMER_PRODUCTION.serviceId,
    projectId: SUMMER_PRODUCTION.projectId,
    teamId: SUMMER_PRODUCTION.teamId,
    environment: 'production',
    deploymentId: ID,
    blobAuth: 'oidc',
    status: SUMMER_PRODUCTION.sourceBoundStatus,
    sourceRevision: SOURCE_REVISION,
    productionOrigin: SUMMER_PRODUCTION.productionOrigin,
    ...overrides,
  };
}

function mockFetch(
  deployment: Record<string, unknown> = {},
  live: { status?: number; body?: unknown } = {}
) {
  const calls: string[] = [];
  const inits: Array<RequestInit | undefined> = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      inits.push(init);
      if (url.includes('api.vercel.com/v13/deployments/')) {
        return Response.json({
          projectId: SUMMER_PRODUCTION.projectId,
          target: 'production',
          readyState: 'READY',
          ...deployment,
        });
      }
      if (url === `${SUMMER_PRODUCTION.productionOrigin}/runtime/v1/identity`) {
        return Response.json(live.body ?? identity(), {
          status: live.status ?? 200,
        });
      }
      throw new Error(`unexpected ${url}`);
    }
  );
  return { fetchImpl, calls, inits };
}

async function run(
  overrides: Parameters<typeof checkSummerEvePin>[0] = {},
  fetch = mockFetch()
) {
  const lines = {
    log: [] as string[],
    error: [] as string[],
  };
  const code = await checkSummerEvePin({
    token: TOKEN,
    fetchImpl: fetch.fetchImpl,
    log: line => lines.log.push(line),
    error: line => lines.error.push(line),
    ...overrides,
  });
  return { code, text: lines.error.join('\n'), lines, ...fetch };
}

describe('checkSummerEvePin', () => {
  afterEach(() => vi.restoreAllMocks());

  it('checks source-bound production identity and ignores a stale deployment pin', async () => {
    const ok = await run({
      deprecatedOrigin: 'legacy-ignored',
      deprecatedDeploymentId: 'stale-pin',
    });
    expect(ok.code).toBe(0);
    expect(ok.lines.error).toEqual([]);
    expect(ok.lines.log.join('\n')).toContain('deprecated and ignored');
    expect(ok.calls).toEqual([
      `${SUMMER_PRODUCTION.productionOrigin}/runtime/v1/identity`,
      expect.stringContaining(`/v13/deployments/${encodeURIComponent(ID)}`),
    ]);
    expect(ok.calls.join('\n')).not.toContain('stale-pin');
    expect(ok.calls.join('\n')).not.toContain('legacy-ignored');
    expect(new Headers(ok.inits[1]?.headers).get('authorization')).toBe(
      `Bearer ${TOKEN}`
    );
  });

  it('still requires identity when the Vercel token is absent', async () => {
    const skipped = await run({ token: '  ' });
    expect(skipped.code).toBe(0);
    expect(skipped.lines.log.join('\n')).toContain(
      '::notice::SUMMER_PIN_CHECK_VERCEL_TOKEN is absent'
    );
    expect(skipped.calls).toEqual([
      `${SUMMER_PRODUCTION.productionOrigin}/runtime/v1/identity`,
    ]);
    const bad = await run(
      { token: '' },
      mockFetch({}, { body: identity({ status: 'configured-unverified' }) })
    );
    expect(bad.code).toBe(1);
    expect(bad.calls).toHaveLength(1);
    expect(bad.text).toContain('source-bound');
  });

  it('fails closed on identity and deployment mismatches', async () => {
    const unreachable = await run(
      {},
      {
        fetchImpl: vi.fn(async () => {
          throw new Error('offline');
        }),
        calls: [],
        inits: [],
      }
    );
    expect(unreachable.code).toBe(1);
    expect(unreachable.text).toContain('unreachable');

    for (const body of [
      identity({ projectId: 'prj_other' }),
      identity({ environment: 'preview' }),
      identity({ target: 'preview' }),
      identity({ blobAuth: 'static' }),
      identity({ id: 'company.other' }),
      identity({ sourceRevision: 'HEAD' }),
    ]) {
      const result = await run({}, mockFetch({}, { body }));
      expect(result.code).toBe(1);
      expect(result.calls.some(url => url.includes('api.vercel.com'))).toBe(
        false
      );
      expect(result.text).not.toContain(TOKEN);
    }

    const missing = await run({}, mockFetch({}, { status: 404, body: {} }));
    expect(missing.code).toBe(1);
    expect(missing.text).toContain('404');

    for (const deployment of [
      { projectId: 'prj_other' },
      { target: 'preview' },
      { readyState: 'ERROR' },
    ]) {
      const result = await run({}, mockFetch(deployment));
      expect(result.code).toBe(1);
      expect(result.text).toContain(SUMMER_PRODUCTION.projectId);
      expect(result.text).not.toContain(TOKEN);
    }
  });

  it('reads deprecated pin keys only to ignore them', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'summer-pin-')), 'pin.env');
    writeFileSync(
      path,
      [
        'OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN="https://evil.test"',
        'OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID="stale-pin"',
        'SUMMER_BLOB_READ_WRITE_TOKEN="super-secret-token"',
      ].join('\n')
    );
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = {
      NODE_ENV: 'test',
      SUMMER_PIN_CHECK_VERCEL_TOKEN: TOKEN,
    } as NodeJS.ProcessEnv;
    const fetch = mockFetch();
    expect(
      await main(['--env-file', path], env, fetch.fetchImpl, file =>
        readFileSync(file, 'utf8')
      )
    ).toBe(0);
    expect(JSON.stringify([log.mock.calls, error.mock.calls])).not.toContain(
      'super-secret-token'
    );
    expect(log.mock.calls.join('\n')).toContain('deprecated and ignored');
    expect(fetch.calls.join('\n')).not.toContain('evil.test');
    expect(fetch.calls.join('\n')).not.toContain('stale-pin');
    await expect(main(['--id', ID], env, fetch.fetchImpl)).rejects.toThrow(
      'Unknown argument'
    );
  });
});
