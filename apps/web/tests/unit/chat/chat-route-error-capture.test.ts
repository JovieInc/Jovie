/**
 * Regression contract for GH #13300: web chat failed all day with
 * CHAT_STREAM_FAILED while the underlying exception never reached Sentry or
 * the Vercel logs.
 *
 * The chat route's two terminal error paths (the route-level catch and the
 * mid-stream telemetry hook) must capture through `captureError` — which
 * logs the real exception to stdout keyed by the on-screen reference id
 * (`requestId`) and guards on Sentry SDK initialization — and must flush
 * Sentry before the lambda suspends, because streaming responses freeze the
 * function the moment the response ends and drop unsent events.
 *
 * A source-level contract (rather than invoking the 3k-line route module)
 * keeps this deterministic and dependency-free while preventing the exact
 * regression: someone deleting the capture/flush from either catch path.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync(
  join(__dirname, '../../../app/api/chat/route.ts'),
  'utf8'
);

describe('chat route error capture contract (GH #13300)', () => {
  it('imports the canonical captureError wrapper', () => {
    expect(routeSource).toContain(
      "import { captureError } from '@/lib/error-tracking';"
    );
  });

  it('captures the real exception on both terminal error paths', () => {
    const captures = routeSource.match(
      /captureError\('Chat stream failed', error/g
    );
    // 1: route-level catch (buildChatErrorResponse)
    // 2: mid-stream telemetry captureException hook
    expect(captures?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('keys the capture context by the on-screen reference id (requestId)', () => {
    const routeCatch = routeSource.slice(
      routeSource.indexOf("captureError('Chat stream failed'")
    );
    expect(routeCatch).toContain('requestId');
  });

  it('flushes Sentry before the lambda can suspend on both paths', () => {
    const flushes = routeSource.match(
      /Sentry\.flush\(SENTRY_FLUSH_TIMEOUT_MS\)/g
    );
    expect(flushes?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
