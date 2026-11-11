import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBaseClientConfig, getBaseServerConfig } from '@/lib/sentry/config';

vi.unmock('@sentry/nextjs');
afterEach(() => vi.unstubAllEnvs());

// Exercise the installed SDK, not the shared test mock or only an options snapshot.
describe('Sentry 11 collection policy', () => {
  it('keeps production Replay disabled through synchronous and lazy setup while error reporting works', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const sdk =
      await vi.importActual<typeof import('@sentry/nextjs')>('@sentry/nextjs');
    const { getFullClientConfig, addReplayIntegration } = await vi.importActual<
      typeof import('@/lib/sentry/client-full')
    >('@/lib/sentry/client-full');
    const envelopes: unknown[] = [];
    const config = getFullClientConfig({
      enableBreadcrumbs: false,
      enableReplay: true,
      replaysSessionSampleRate: 1,
      replaysOnErrorSampleRate: 1,
    });
    const client = sdk.init({
      ...config,
      dsn: 'https://public@example.com/1',
      defaultIntegrations: false,
      enableOpenTelemetrySetup: false,
      tracesSampleRate: 0,
      transport: () => ({
        send: async (envelope: unknown) => {
          envelopes.push(envelope);
          return { statusCode: 200 };
        },
        flush: async () => true,
      }),
    });
    if (!client) throw new Error('Sentry client was not created');
    try {
      expect(config).toMatchObject({
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
      });
      expect(await addReplayIntegration(1, true)).toBe(false);
      expect(client.getIntegrationByName('Replay')).toBeUndefined();
      client.captureEvent({ message: 'production-error-reporting-probe' });
      expect(await client.flush(2000)).toBe(true);
      expect(JSON.stringify(envelopes)).toContain(
        'production-error-reporting-probe'
      );
      expect(JSON.stringify(envelopes)).not.toContain('replay_event');
    } finally {
      await client.close(2000);
      sdk.getCurrentScope().setClient(undefined);
    }
  });
  it('keeps client collection restrictive in resolved SDK options and serialized events', async () => {
    const sdk =
      await vi.importActual<typeof import('@sentry/nextjs')>('@sentry/nextjs');
    const envelopes: unknown[] = [];
    const client = sdk.init({
      ...getBaseClientConfig(),
      dsn: 'https://public@example.com/1',
      defaultIntegrations: false,
      integrations: [sdk.requestDataIntegration()],
      enableOpenTelemetrySetup: false,
      tracesSampleRate: 0,
      transport: () => ({
        send: async (envelope: unknown) => {
          envelopes.push(envelope);
          return { statusCode: 200 };
        },
        flush: async () => true,
      }),
    });
    if (!client) throw new Error('Sentry client was not created');
    try {
      expect(client.getDataCollectionOptions()).toMatchObject({
        userInfo: false,
        cookies: false,
        httpBodies: [],
        genAI: { inputs: false, outputs: false },
        databaseQueryData: false,
        queues: false,
        graphQL: { document: false, variables: false },
      });
      client.captureEvent({
        message: 'collection-policy-probe',
        sdkProcessingMetadata: {
          normalizedRequest: {
            method: 'GET',
            url: 'https://jovie.example/profile?token=private-query&view=compact',
            headers: {
              cookie: 'session=private-cookie',
              authorization: 'Bearer private-header',
              'x-forwarded-for': '203.0.113.8',
              'content-type': 'application/json',
            },
          },
          ipAddress: '203.0.113.8',
        },
      });
      sdk.logger.info('collection-policy-log');
      expect(await client.flush(2000)).toBe(true);
      const serialized = JSON.stringify(envelopes);
      expect(serialized).toContain('collection-policy-probe');
      expect(serialized).toContain('collection-policy-log');
      expect(serialized).toContain('application/json');
      expect(serialized).not.toMatch(
        /private-query|private-cookie|private-header|203\.0\.113\.8/
      );
    } finally {
      await client.close(2000);
      sdk.getCurrentScope().setClient(undefined);
    }
  });
  it('keeps server user context and disables model input/output collection in SDK options', async () => {
    const sdk =
      await vi.importActual<typeof import('@sentry/nextjs')>('@sentry/nextjs');
    const client = sdk.init({
      ...getBaseServerConfig(),
      dsn: 'https://public@example.com/1',
      defaultIntegrations: false,
      enableOpenTelemetrySetup: false,
      tracesSampleRate: 0,
      transport: () => ({
        send: async () => ({ statusCode: 200 }),
        flush: async () => true,
      }),
    });
    if (!client) throw new Error('Sentry client was not created');
    try {
      expect(client.getDataCollectionOptions()).toMatchObject({
        userInfo: true,
        genAI: { inputs: false, outputs: false },
      });
    } finally {
      await client.close(2000);
      sdk.getCurrentScope().setClient(undefined);
    }
  });
});
