import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('server instrumentation guard', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('skips server observability in local E2E mode', async () => {
    process.env.CI = 'false';
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_E2E_MODE = '1';
    delete process.env.JOVIE_ENABLE_LOCAL_SENTRY;

    const { shouldSkipServerObservability } = await import('@/instrumentation');

    expect(shouldSkipServerObservability()).toBe(true);
  });

  it('keeps server observability enabled in production', async () => {
    process.env.CI = 'false';
    process.env.NODE_ENV = 'production';
    delete process.env.NEXT_PUBLIC_E2E_MODE;
    delete process.env.E2E_USE_TEST_AUTH_BYPASS;

    const { shouldSkipServerObservability } = await import('@/instrumentation');

    expect(shouldSkipServerObservability()).toBe(false);
  });

  it('keeps server observability enabled in preview when E2E bypass is configured', async () => {
    process.env.CI = 'false';
    process.env.NODE_ENV = 'production';
    process.env.VERCEL_ENV = 'preview';
    process.env.E2E_USE_TEST_AUTH_BYPASS = '1';
    delete process.env.JOVIE_ENABLE_LOCAL_SENTRY;

    const { shouldSkipServerObservability } = await import('@/instrumentation');

    expect(shouldSkipServerObservability()).toBe(false);
  });

  it('keeps server observability enabled in production builds with auth bypass only', async () => {
    process.env.CI = 'false';
    process.env.NODE_ENV = 'production';
    process.env.E2E_USE_TEST_AUTH_BYPASS = '1';
    delete process.env.NEXT_PUBLIC_E2E_MODE;
    delete process.env.VERCEL_ENV;
    delete process.env.JOVIE_ENABLE_LOCAL_SENTRY;

    const { shouldSkipServerObservability } = await import('@/instrumentation');

    expect(shouldSkipServerObservability()).toBe(false);
  });

  it('captures request errors in edge runtime', async () => {
    process.env.CI = 'false';
    process.env.NODE_ENV = 'production';
    process.env.NEXT_RUNTIME = 'edge';
    delete process.env.NEXT_PUBLIC_E2E_MODE;
    delete process.env.E2E_USE_TEST_AUTH_BYPASS;

    const Sentry = await import('@sentry/nextjs');
    const { onRequestError } = await import('@/instrumentation');
    const error = new Error('edge request failed');

    await onRequestError(error);

    expect(Sentry.captureRequestError).toHaveBeenCalledWith(error);
  });

  it('skips request-error capture for the JOV-5228 UpstashError JSON bag', async () => {
    process.env.CI = 'false';
    process.env.NODE_ENV = 'production';
    process.env.NEXT_RUNTIME = 'nodejs';
    delete process.env.NEXT_PUBLIC_E2E_MODE;
    delete process.env.E2E_USE_TEST_AUTH_BYPASS;

    const Sentry = await import('@sentry/nextjs');
    const { onRequestError } = await import('@/instrumentation');
    const error = new Error('{"error":{"name":"UpstashError"}}');

    await onRequestError(error);

    expect(Sentry.captureRequestError).not.toHaveBeenCalled();
  });

  it('skips request-error capture for a thrown { clerkUserId, error: UpstashError } object (JOV-5185)', async () => {
    process.env.CI = 'false';
    process.env.NODE_ENV = 'production';
    process.env.NEXT_RUNTIME = 'nodejs';
    delete process.env.NEXT_PUBLIC_E2E_MODE;
    delete process.env.E2E_USE_TEST_AUTH_BYPASS;

    const Sentry = await import('@sentry/nextjs');
    const { onRequestError } = await import('@/instrumentation');
    const inner = new Error(
      'Command failed: ERR max requests limit exceeded. Limit: 500000'
    );
    inner.name = 'UpstashError';

    await onRequestError({
      clerkUserId: 'af5b9ee0-ecec-4508-86e0-4f364c2e349d',
      error: inner,
    });

    expect(Sentry.captureRequestError).not.toHaveBeenCalled();
  });

  it('skips request-error capture for a thrown { error: UpstashError } object (JOV-5218)', async () => {
    process.env.CI = 'false';
    process.env.NODE_ENV = 'production';
    process.env.NEXT_RUNTIME = 'nodejs';
    delete process.env.NEXT_PUBLIC_E2E_MODE;
    delete process.env.E2E_USE_TEST_AUTH_BYPASS;

    const Sentry = await import('@sentry/nextjs');
    const { onRequestError } = await import('@/instrumentation');
    const inner = new Error(
      'Command failed: ERR max requests limit exceeded. Limit: 500000'
    );
    inner.name = 'UpstashError';

    await onRequestError({ error: inner });

    expect(Sentry.captureRequestError).not.toHaveBeenCalled();
  });

  it('skips request-error capture for the JOV-5184 quota command failure', async () => {
    process.env.CI = 'false';
    process.env.NODE_ENV = 'production';
    process.env.NEXT_RUNTIME = 'nodejs';
    delete process.env.NEXT_PUBLIC_E2E_MODE;
    delete process.env.E2E_USE_TEST_AUTH_BYPASS;

    const Sentry = await import('@sentry/nextjs');
    const { onRequestError } = await import('@/instrumentation');
    const error = new Error(
      'Command failed: ERR max requests limit exceeded. Limit: 500000, Usage: 500099'
    );
    error.name = 'UpstashError';

    await onRequestError(error);

    expect(Sentry.captureRequestError).not.toHaveBeenCalled();
  });

  it('captures unrelated Upstash auth request errors', async () => {
    process.env.CI = 'false';
    process.env.NODE_ENV = 'production';
    process.env.NEXT_RUNTIME = 'nodejs';
    delete process.env.NEXT_PUBLIC_E2E_MODE;
    delete process.env.E2E_USE_TEST_AUTH_BYPASS;

    const Sentry = await import('@sentry/nextjs');
    const { onRequestError } = await import('@/instrumentation');
    const error = new Error(
      'WRONGPASS invalid or missing auth token. See https://docs.upstash.com/redis/troubleshooting/http_unauthorized for details.'
    );
    error.name = 'UpstashError';

    await onRequestError(error);

    expect(Sentry.captureRequestError).toHaveBeenCalledWith(error);
  });

  it('skips request-error capture when Next.js wraps the JOV-5209 bag on cause', async () => {
    process.env.CI = 'false';
    process.env.NODE_ENV = 'production';
    process.env.NEXT_RUNTIME = 'nodejs';
    delete process.env.NEXT_PUBLIC_E2E_MODE;
    delete process.env.E2E_USE_TEST_AUTH_BYPASS;

    const Sentry = await import('@sentry/nextjs');
    const { onRequestError } = await import('@/instrumentation');
    const wrapper = new Error(
      'An error occurred in the Server Components render'
    );
    wrapper.cause = { error: { name: 'UpstashError' } };

    await onRequestError(wrapper);

    expect(Sentry.captureRequestError).not.toHaveBeenCalled();
  });

  it('skips request-error capture for a thrown quota UpstashError (JOV-5181)', async () => {
    process.env.CI = 'false';
    process.env.NODE_ENV = 'production';
    process.env.NEXT_RUNTIME = 'nodejs';
    delete process.env.NEXT_PUBLIC_E2E_MODE;
    delete process.env.E2E_USE_TEST_AUTH_BYPASS;

    const Sentry = await import('@sentry/nextjs');
    const { onRequestError } = await import('@/instrumentation');
    const error = new Error(
      'Command failed: ERR max requests limit exceeded. Limit: 500000, Usage: 500099. See https://upstash.com/docs/redis/troubleshooting/max_requests_limit for details'
    );
    error.name = 'UpstashError';

    await onRequestError(error);

    expect(Sentry.captureRequestError).not.toHaveBeenCalled();
  });

  it('skips request-error capture when Next.js wraps a quota UpstashError on cause (JOV-5181)', async () => {
    process.env.CI = 'false';
    process.env.NODE_ENV = 'production';
    process.env.NEXT_RUNTIME = 'nodejs';
    delete process.env.NEXT_PUBLIC_E2E_MODE;
    delete process.env.E2E_USE_TEST_AUTH_BYPASS;

    const Sentry = await import('@sentry/nextjs');
    const { onRequestError } = await import('@/instrumentation');
    const inner = new Error(
      'Command failed: ERR max requests limit exceeded. Limit: 500000, Usage: 500099'
    );
    inner.name = 'UpstashError';
    const wrapper = new Error(
      'An error occurred in the Server Components render'
    );
    wrapper.cause = inner;

    await onRequestError(wrapper);

    expect(Sentry.captureRequestError).not.toHaveBeenCalled();
  });
});

describe('client instrumentation bundle isolation', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'instrumentation-client.ts'),
    'utf8'
  );

  it('does not statically retain dashboard Sentry tracing on public routes', () => {
    expect(source).not.toContain(
      "import { captureRouterTransitionStart } from '@sentry/nextjs'"
    );
    expect(source).toContain("import('@sentry/nextjs')");
    expect(source).toContain(
      "getSdkMode(globalThis.location.pathname) !== 'full'"
    );
    expect(source).toContain('routerTransitionCapture?.(...args)');
    expect(source).not.toContain(
      'loadRouterTransitionCapture().then(capture => capture(...args))'
    );
  });
});
