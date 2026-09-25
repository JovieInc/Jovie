import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkSummerEvePin,
  main,
  type SummerEvePinCheckInput,
} from './summer-eve-pin-check';
import { SUMMER_PRODUCTION } from './summer-production-identity';

const ORIGIN = 'https://jovie-eve-shadow-abc123-jovie.vercel.app';
const HOST = 'jovie-eve-shadow-abc123-jovie.vercel.app';
const ID = 'dpl_pinned123';
const TOKEN = 'read-only-token';

function deployment(overrides: Record<string, unknown> = {}) {
  return {
    projectId: SUMMER_PRODUCTION.projectId,
    target: 'production',
    readyState: 'READY',
    url: HOST,
    ...overrides,
  };
}

function identity(overrides: Record<string, unknown> = {}) {
  return {
    id: SUMMER_PRODUCTION.serviceId,
    projectId: SUMMER_PRODUCTION.projectId,
    environment: 'production',
    deploymentId: ID,
    blobAuth: 'oidc',
    sourceRevision: 'a'.repeat(40),
    ...overrides,
  };
}

function capture() {
  const lines = {
    log: [] as string[],
    warn: [] as string[],
    error: [] as string[],
  };
  return {
    lines,
    log: (line: string) => {
      lines.log.push(line);
    },
    warn: (line: string) => {
      lines.warn.push(line);
    },
    error: (line: string) => {
      lines.error.push(line);
    },
  };
}

function installFetch(options?: {
  deployment?: unknown;
  deploymentStatus?: number;
  identity?: unknown;
  identityStatus?: number;
  live?: unknown;
  liveStatus?: number;
}) {
  const calls: string[] = [];
  const inits: Array<RequestInit | undefined> = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      inits.push(init);
      if (url.includes('api.vercel.com/v13/deployments/')) {
        return Response.json(options?.deployment ?? deployment(), {
          status: options?.deploymentStatus ?? 200,
        });
      }
      if (url === `${ORIGIN}/runtime/v1/identity`) {
        return Response.json(options?.identity ?? identity(), {
          status: options?.identityStatus ?? 200,
        });
      }
      if (url === `${SUMMER_PRODUCTION.productionOrigin}/runtime/v1/identity`) {
        return Response.json(options?.live ?? identity(), {
          status: options?.liveStatus ?? 200,
        });
      }
      throw new Error(`unexpected ${url}`);
    }
  );
  return { fetchImpl, calls, inits };
}

async function run(
  overrides: Partial<SummerEvePinCheckInput> = {},
  fetchOptions?: Parameters<typeof installFetch>[0]
) {
  const io = capture();
  const { fetchImpl, calls, inits } = installFetch(fetchOptions);
  const code = await checkSummerEvePin({
    origin: ORIGIN,
    deploymentId: ID,
    token: TOKEN,
    fetchImpl,
    ...io,
    ...overrides,
  });
  return { code, ...io, calls, inits, fetchImpl };
}

describe('checkSummerEvePin', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips with a notice when the read-only token is missing', async () => {
    const result = await run({ token: '  ' });
    expect(result.code).toBe(0);
    expect(result.lines.log.join('\n')).toContain(
      '::notice::SUMMER_PIN_CHECK_VERCEL_TOKEN is absent'
    );
    expect(result.calls).toEqual([]);
  });

  it('accepts a READY production pin that matches summer.jov.ie', async () => {
    const result = await run();
    expect(result.code).toBe(0);
    expect(result.lines.error).toEqual([]);
    expect(result.lines.warn).toEqual([]);
    expect(result.calls).toHaveLength(3);
    const init = result.inits[0];
    expect(new Headers(init?.headers).get('authorization')).toBe(
      `Bearer ${TOKEN}`
    );
  });

  it('fails when the origin or deployment id does not match the schema', async () => {
    const origin = await run({ origin: 'https://summer.jov.ie' });
    expect(origin.code).toBe(1);
    expect(origin.calls).toEqual([]);
    const id = await run({ deploymentId: 'deployment_123' });
    expect(id.code).toBe(1);
    expect(id.lines.error.join('\n')).toContain(
      'OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID'
    );
  });

  it('fails when the deployment belongs to another project', async () => {
    const result = await run(
      {},
      { deployment: deployment({ projectId: 'prj_other' }) }
    );
    expect(result.code).toBe(1);
    expect(result.calls.some(url => url.includes('/runtime/v1/identity'))).toBe(
      false
    );
    expect(result.lines.error.join('\n')).not.toContain(TOKEN);
  });

  it('fails when the deployment target is preview', async () => {
    const result = await run(
      {},
      { deployment: deployment({ target: 'preview' }) }
    );
    expect(result.code).toBe(1);
  });

  it('fails when the deployment readyState is ERROR', async () => {
    const result = await run(
      {},
      { deployment: deployment({ readyState: 'ERROR' }) }
    );
    expect(result.code).toBe(1);
  });

  it('fails when the deployment host does not match the origin', async () => {
    const result = await run(
      {},
      {
        deployment: deployment({
          url: 'jovie-eve-shadow-other-jovie.vercel.app',
        }),
      }
    );
    expect(result.code).toBe(1);
  });

  it('fails when pinned identity is 404, the pre-OIDC EL6b case', async () => {
    const result = await run({}, { identityStatus: 404, identity: {} });
    expect(result.code).toBe(1);
    expect(result.lines.error.join('\n')).toContain('404');
    expect(
      result.calls.some(url =>
        url.startsWith(SUMMER_PRODUCTION.productionOrigin)
      )
    ).toBe(false);
  });

  it('fails when blob auth is not oidc', async () => {
    const result = await run(
      {},
      { identity: identity({ blobAuth: 'static' }) }
    );
    expect(result.code).toBe(1);
    expect(result.lines.error.join('\n')).toContain('oidc');
  });

  it('warns on drift by default and fails when strict', async () => {
    const drifted = identity({ deploymentId: 'dpl_live999' });
    const warning = await run({}, { live: drifted });
    expect(warning.code).toBe(0);
    expect(warning.lines.warn.join('\n')).toContain('::warning::');
    expect(warning.lines.warn.join('\n')).toContain('dpl_live999');
    expect(warning.lines.error).toEqual([]);

    const strict = await run({ strict: true }, { live: drifted });
    expect(strict.code).toBe(1);
    expect(strict.lines.warn.join('\n')).toContain('::warning::');
    expect(strict.lines.error.join('\n')).toContain('::warning::');
  });

  it('reads only the pin keys from an env file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'summer-pin-'));
    const path = join(dir, 'pin.env');
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
    const { fetchImpl } = installFetch();
    const code = await main(
      ['--env-file', path],
      {
        NODE_ENV: 'test',
        SUMMER_PIN_CHECK_VERCEL_TOKEN: TOKEN,
      } as NodeJS.ProcessEnv,
      fetchImpl
    );
    expect(code).toBe(0);
    const printed = JSON.stringify([log.mock.calls, error.mock.calls]);
    expect(printed).not.toContain('super-secret-token');
  });

  it('fails when the identity service id is not company.summer', async () => {
    const result = await run(
      {},
      { identity: identity({ id: 'company.other' }) }
    );
    expect(result.code).toBe(1);
  });

  it('lets flags override the environment', async () => {
    const { fetchImpl, calls } = installFetch();
    const code = await main(
      ['--origin', ORIGIN, '--id', ID, '--strict'],
      {
        NODE_ENV: 'test',
        SUMMER_PIN_CHECK_VERCEL_TOKEN: TOKEN,
        OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN: 'https://summer.jov.ie',
        OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID: 'not-a-deployment',
      } as NodeJS.ProcessEnv,
      fetchImpl
    );
    expect(code).toBe(0);
    expect(calls[0]).toContain(encodeURIComponent(ID));
  });
});
