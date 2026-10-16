import { expect, it } from 'vitest';
import { intakeDocsDeploy } from '../../docs-deploy-intake.mjs';

const INSTALLATION =
  '{"message":"API rate limit exceeded for installation ID 1."}';
const PERMISSION = '{"message":"Resource not accessible by integration"}';

/**
 * @param {number} status
 * @param {unknown} body
 */
function response(status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
    text: async () => text,
  };
}

/**
 * @param {Record<string, { status: number, body: unknown }>} routes
 */
function fetchImpl(routes) {
  return async url => {
    const href = String(url);
    const route = Object.entries(routes).find(([needle]) =>
      href.includes(needle)
    );
    if (!route) throw new Error(`unexpected ${href}`);
    return response(route[1].status, route[1].body);
  };
}

const deployment = {
  id: 9,
  sha: 'a'.repeat(40),
  payload: { web_url: 'https://jovie-docs.example/deploy' },
};

it('defers an installation 403 from the docs deployment list', async () => {
  let applied = false;
  const warnings = [];
  const original = console.warn;
  console.warn = message => warnings.push(String(message));
  try {
    const result = await intakeDocsDeploy({
      token: 'token',
      fetchImpl: fetchImpl({
        '/deployments?': { status: 403, body: INSTALLATION },
      }),
      apply: async () => {
        applied = true;
        return { ok: true, action: 'resolve' };
      },
    });
    expect(result).toEqual({
      ok: true,
      action: 'defer',
      reason: 'installation_rate_limit',
    });
    expect(applied).toBe(false);
    expect(warnings.join('\n')).toContain('installation-quota-403');
    expect(warnings.join('\n')).toContain('not confirmed healthy');
    expect(warnings.join('\n')).toContain('no Linear issue was resolved');
  } finally {
    console.warn = original;
  }
});

it('throws a permission 403 from compare instead of treating it as off-main', async () => {
  await expect(
    intakeDocsDeploy({
      token: 'token',
      fetchImpl: fetchImpl({
        '/deployments?': { status: 200, body: [deployment] },
        '/compare/': { status: 403, body: PERMISSION },
      }),
      apply: async () => {
        throw new Error('apply should not run');
      },
    })
  ).rejects.toThrow('docs deployment compare failed: 403');
});

it('throws a permission 403 instead of deferring the docs signal', async () => {
  await expect(
    intakeDocsDeploy({
      token: 'token',
      fetchImpl: fetchImpl({
        '/deployments?': { status: 403, body: PERMISSION },
      }),
      apply: async () => {
        throw new Error('apply should not run');
      },
    })
  ).rejects.toThrow('docs deployment list failed: 403');
});

it.each(['compare/', '/statuses'])(
  'defers an installation 403 from %s without resolving',
  async needle => {
    let applied = false;
    const result = await intakeDocsDeploy({
      token: 'token',
      fetchImpl: fetchImpl({
        '/deployments?': { status: 200, body: [deployment] },
        '/compare/': {
          status: needle === 'compare/' ? 403 : 200,
          body: needle === 'compare/' ? INSTALLATION : { status: 'identical' },
        },
        '/statuses': {
          status: needle === '/statuses' ? 403 : 200,
          body: needle === '/statuses' ? INSTALLATION : [{ state: 'failure' }],
        },
      }),
      apply: async () => {
        applied = true;
        return { ok: true, action: 'resolve' };
      },
    });
    expect(result.action).toBe('defer');
    expect(applied).toBe(false);
  }
);

it('still plans a real docs failure when GitHub answers', async () => {
  /** @type {unknown[]} */
  const plans = [];
  const result = await intakeDocsDeploy({
    token: 'token',
    fetchImpl: fetchImpl({
      '/deployments?': { status: 200, body: [deployment] },
      '/compare/': { status: 200, body: { status: 'identical' } },
      '/statuses': { status: 200, body: [{ state: 'failure' }] },
    }),
    apply: async plan => {
      plans.push(plan);
      return { ok: true, action: plan.action };
    },
  });
  expect(plans).toEqual([
    { action: 'upsert', key: 'vercel-deploy-failed-jovie-docs' },
  ]);
  expect(result).toEqual({ ok: true, action: 'upsert' });
});
