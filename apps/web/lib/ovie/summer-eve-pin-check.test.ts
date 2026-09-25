import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkSummerEvePin, main } from './summer-eve-pin-check';
import { SUMMER_PRODUCTION } from './summer-production-identity';

const ORIGIN = 'https://jovie-eve-shadow-abc123-jovie.vercel.app';
const HOST = 'jovie-eve-shadow-abc123-jovie.vercel.app';
const ID = 'dpl_pinned123';
const TOKEN = 'read-only-token';

function identity(overrides: Record<string, unknown> = {}) {
  return {
    id: SUMMER_PRODUCTION.serviceId,
    projectId: SUMMER_PRODUCTION.projectId,
    environment: 'production',
    deploymentId: ID,
    blobAuth: 'oidc',
    ...overrides,
  };
}

function mockFetch(
  deployment: Record<string, unknown> = {},
  pinned: { status?: number; body?: unknown } = {},
  live: unknown = identity()
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
          url: HOST,
          ...deployment,
        });
      }
      if (url === `${ORIGIN}/runtime/v1/identity`) {
        return Response.json(pinned.body ?? identity(), {
          status: pinned.status ?? 200,
        });
      }
      if (url === `${SUMMER_PRODUCTION.productionOrigin}/runtime/v1/identity`) {
        return Response.json(live);
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
    warn: [] as string[],
    error: [] as string[],
  };
  const code = await checkSummerEvePin({
    origin: ORIGIN,
    deploymentId: ID,
    token: TOKEN,
    fetchImpl: fetch.fetchImpl,
    log: line => lines.log.push(line),
    warn: line => lines.warn.push(line),
    error: line => lines.error.push(line),
    ...overrides,
  });
  return { code, text: lines.error.join('\n'), lines, ...fetch };
}

describe('checkSummerEvePin', () => {
  afterEach(() => vi.restoreAllMocks());

  it('skips without a token and accepts a matching READY pin', async () => {
    const skipped = await run({ token: '  ' });
    expect(skipped.code).toBe(0);
    expect(skipped.lines.log.join('\n')).toContain(
      '::notice::SUMMER_PIN_CHECK_VERCEL_TOKEN is absent'
    );
    expect(skipped.calls).toEqual([]);
    const ok = await run();
    expect(ok.code).toBe(0);
    expect(ok.lines.error).toEqual([]);
    expect(ok.calls).toHaveLength(3);
    expect(new Headers(ok.inits[0]?.headers).get('authorization')).toBe(
      `Bearer ${TOKEN}`
    );
  });

  it('fails schema, deployment, and identity checks before treating drift as success', async () => {
    expect((await run({ origin: 'https://summer.jov.ie' })).calls).toEqual([]);
    expect((await run({ deploymentId: 'deployment_123' })).text).toContain(
      'OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID'
    );
    for (const deployment of [
      { projectId: 'prj_other' },
      { target: 'preview' },
      { readyState: 'ERROR' },
      { url: 'jovie-eve-shadow-other-jovie.vercel.app' },
    ]) {
      const result = await run({}, mockFetch(deployment));
      expect(result.code).toBe(1);
      expect(result.text).not.toContain(TOKEN);
    }
    const otherProject = await run({}, mockFetch({ projectId: 'prj_other' }));
    expect(
      otherProject.calls.some(url => url.includes('/runtime/v1/identity'))
    ).toBe(false);
    const missing = await run({}, mockFetch({}, { status: 404, body: {} }));
    expect(missing.text).toContain('404');
    expect(
      missing.calls.some(url =>
        url.startsWith(SUMMER_PRODUCTION.productionOrigin)
      )
    ).toBe(false);
    expect(
      (await run({}, mockFetch({}, { body: identity({ blobAuth: 'static' }) })))
        .text
    ).toContain('oidc');
    expect(
      (
        await run(
          {},
          mockFetch({}, { body: identity({ id: 'company.other' }) })
        )
      ).code
    ).toBe(1);
    const drifted = identity({ deploymentId: 'dpl_live999' });
    const warning = await run({}, mockFetch({}, {}, drifted));
    expect(warning.code).toBe(0);
    expect(warning.lines.warn.join('\n')).toContain(
      '::warning::Summer pin drift: pinned'
    );
    expect(warning.lines.warn.join('\n')).toContain('dpl_live999');
    const strict = await run({ strict: true }, mockFetch({}, {}, drifted));
    expect(strict.code).toBe(1);
    expect(strict.text).toContain('::warning::');
  });

  it('reads only pin keys from an env file and lets flags override env', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'summer-pin-')), 'pin.env');
    writeFileSync(
      path,
      [
        `OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN="${ORIGIN}"`,
        `OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID="${ID}"`,
        'SUMMER_BLOB_READ_WRITE_TOKEN="super-secret-token"',
      ].join('\n')
    );
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = {
      NODE_ENV: 'test',
      SUMMER_PIN_CHECK_VERCEL_TOKEN: TOKEN,
    } as NodeJS.ProcessEnv;
    expect(await main(['--env-file', path], env, mockFetch().fetchImpl)).toBe(
      0
    );
    expect(JSON.stringify([log.mock.calls, error.mock.calls])).not.toContain(
      'super-secret-token'
    );
    const flagged = mockFetch();
    expect(
      await main(
        ['--origin', ORIGIN, '--id', ID, '--strict'],
        {
          ...env,
          OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN: 'https://summer.jov.ie',
          OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID: 'not-a-deployment',
        },
        flagged.fetchImpl
      )
    ).toBe(0);
    expect(flagged.calls[0]).toContain(encodeURIComponent(ID));
  });
});
