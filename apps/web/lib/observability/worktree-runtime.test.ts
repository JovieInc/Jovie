// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAiTelemetry } from '../ai/telemetry';
import { getBaseClientConfig, getBaseServerConfig } from '../sentry/config';
import {
  getWorktreeAttributes,
  getWorktreeIdentity,
  getWorktreeSentryOptions,
} from './worktree-runtime';

vi.mock('@/lib/env', () => ({
  env: new Proxy({}, { get: (_target, prop) => process.env[String(prop)] }),
}));
const identity = {
  id: `wt_${'a'.repeat(24)}`,
  head: 'b'.repeat(40),
  boot: 'c'.repeat(32),
  port: 3100,
};
function local() {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('VERCEL_ENV', 'development');
  vi.stubEnv('NEXT_PUBLIC_JOVIE_WORKTREE_IDENTITY', JSON.stringify(identity));
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('local app and telemetry correlation', () => {
  it('publishes the launcher identity through the actual health route without cache', async () => {
    local();
    const { GET } = await import('@/app/api/health/build-info/route');
    const response = await GET();
    expect((await response.json()).worktree).toEqual(identity);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(getWorktreeIdentity()).toEqual(identity);
  });
  it.each([
    ['production', 'development'],
    ['development', 'preview'],
    ['development', 'production'],
  ])(
    'omits identity in %s / %s despite inherited values',
    async (nodeEnv, vercelEnv) => {
      local();
      vi.stubEnv('NODE_ENV', nodeEnv);
      vi.stubEnv('VERCEL_ENV', vercelEnv);
      const { GET } = await import('@/app/api/health/build-info/route');
      expect((await (await GET()).json()).worktree).toBeUndefined();
      expect(getWorktreeIdentity()).toBeNull();
      expect(getWorktreeAttributes()).toEqual({});
      expect(getWorktreeSentryOptions()).toEqual({});
    }
  );
  it('does not configure tags when no launcher identity exists', () => {
    vi.stubEnv('NEXT_PUBLIC_JOVIE_WORKTREE_IDENTITY', '');
    expect(getWorktreeSentryOptions()).toEqual({});
  });
  it('composes client/server SDK metric and span hooks and prevents caller spoofing', () => {
    local();
    const attributes = getWorktreeAttributes();
    for (const config of [getBaseClientConfig(), getBaseServerConfig()]) {
      expect(config.initialScope).toEqual({ tags: attributes });
      const metric = {
        name: 'requests',
        type: 'counter' as const,
        value: 1,
        attributes: { other: 'keep', 'jovie.worktree.id': 'spoof' },
      };
      expect(config.beforeSendMetric?.(metric)?.attributes).toEqual({
        ...attributes,
        other: 'keep',
      });
      const span = {
        span_id: '1234567890123456',
        trace_id: 'a'.repeat(32),
        start_timestamp: 1,
        name: 'worktree proof',
        status: 'ok' as const,
        is_segment: true,
        attributes: { other: 'keep', 'jovie.worktree.id': 'spoof' },
      };
      expect(config.beforeSendSpan?.(span)?.attributes).toEqual({
        ...attributes,
        other: 'keep',
      });
    }
    expect(
      buildAiTelemetry({
        functionId: 'test',
        metadata: { 'jovie.worktree.id': 'spoof', model: 'keep' },
      }).metadata
    ).toEqual({ ...attributes, model: 'keep' });
  });
  it('tags application logs with the same boot without changing their payload', async () => {
    local();
    vi.resetModules();
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { logger } = await import('../utils/logger');
    logger.info('ready', { value: 1 }, 'app');
    expect(info).toHaveBeenCalledWith(
      `[worktree ${identity.id} boot=${identity.boot}] [app] ready`,
      { value: 1 }
    );
  });
});
