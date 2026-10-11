// @vitest-environment node

import { afterEach, expect, it, vi } from 'vitest';
import { getWorktreeSentryOptions } from './worktree-runtime';

type SentryOptions = NonNullable<
  Parameters<typeof import('@sentry/nextjs')['init']>[0]
>;
type Transport = ReturnType<NonNullable<SentryOptions['transport']>>;
type Envelope = Parameters<Transport['send']>[0];

// Exercise the installed SDK serialization through an in-memory transport. No
// account, valid credentials, network exporter or application side effects.
afterEach(() => vi.unstubAllEnvs());
it('carries one boot identity through actual error, metric and trace envelopes', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('VERCEL_ENV', 'development');
  const identity = {
    id: `wt_${'1'.repeat(24)}`,
    head: '2'.repeat(40),
    boot: '3'.repeat(32),
    port: 3100,
  };
  vi.stubEnv('NEXT_PUBLIC_JOVIE_WORKTREE_IDENTITY', JSON.stringify(identity));
  const sdk =
    await vi.importActual<typeof import('@sentry/nextjs')>('@sentry/nextjs');
  const envelopes: Envelope[] = [];
  sdk.init({
    ...getWorktreeSentryOptions(),
    dsn: 'https://public@example.invalid/1',
    defaultIntegrations: false,
    tracesSampleRate: 1,
    transport: () => ({
      send: async (envelope: Envelope) => {
        envelopes.push(envelope);
        return { statusCode: 200 };
      },
      flush: async () => true,
    }),
  });
  try {
    sdk.captureMessage('worktree proof');
    sdk.metrics.count('worktree.proof', 1);
    await sdk.startSpan({ name: 'worktree proof root' }, async () => {
      await sdk.startSpan(
        { name: 'worktree proof child' },
        async () => undefined
      );
    });
    await sdk.flush(3000);
    const items = envelopes.flatMap<Envelope[1][number]>(
      envelope => envelope[1]
    );
    const error = items.find(([header]) => header.type === 'event');
    const spans = items.filter(([header]) => header.type === 'span');
    const metrics = items.filter(([header]) =>
      String(header.type).includes('metric')
    );
    expect(error).toBeDefined();
    expect(spans.length).toBeGreaterThan(0);
    for (const [, payload] of spans) {
      expect(payload).toEqual(
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              attributes: expect.objectContaining({
                'jovie.worktree.id': { type: 'string', value: identity.id },
                'jovie.worktree.boot': { type: 'string', value: identity.boot },
              }),
            }),
          ]),
        })
      );
    }
    expect(metrics.length).toBeGreaterThan(0);
    for (const receipt of [error, spans, metrics]) {
      const encoded = JSON.stringify(receipt);
      expect(encoded).toContain(identity.id);
      expect(encoded).toContain(identity.head);
      expect(encoded).toContain(identity.boot);
    }
  } finally {
    await sdk.close(3000);
  }
}, 15000);
