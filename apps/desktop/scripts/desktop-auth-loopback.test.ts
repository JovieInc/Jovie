import { expect, test, vi } from 'vitest';
import {
  DESKTOP_AUTH_LOOPBACK_PATH,
  startDesktopAuthLoopbackServer,
} from '../src/desktop-auth-loopback.ts';
import type { ParsedAuthReturnDeepLink } from '../src/desktop-auth-security.ts';

const VALID_CODE = '00000000000040008000000000000001';
const VALID_STATE = '11111111111141111111111111111111';
const FLOW = 'htmjTw7x7kSYKEPuInDfGOJ0U9q56p4Y';

function completeUrl(port: number, query = ''): string {
  const url = new URL(`http://127.0.0.1:${port}${DESKTOP_AUTH_LOOPBACK_PATH}`);
  url.searchParams.set('code', VALID_CODE);
  url.searchParams.set('state', VALID_STATE);
  url.searchParams.set('desktop_flow', FLOW);
  return `${url.toString()}${query}`;
}

async function withServer(
  onComplete: (
    completion: ParsedAuthReturnDeepLink
  ) => 'completed' | 'unmatched',
  run: (port: number) => Promise<void>
): Promise<void> {
  const server = await startDesktopAuthLoopbackServer({ onComplete });
  expect(server).not.toBeNull();
  try {
    await run(server?.port ?? 0);
  } finally {
    server?.close();
  }
}

test('hands a well-formed completion to the pending flow and answers a done page', async () => {
  const onComplete = vi.fn(() => 'completed' as const);
  await withServer(onComplete, async port => {
    const response = await fetch(completeUrl(port));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Return to Jovie');
    expect(onComplete).toHaveBeenCalledWith({
      code: VALID_CODE,
      state: VALID_STATE,
      flowNonce: FLOW,
    });
  });
});

test('answers the inactive page when nothing binds the completion', async () => {
  await withServer(
    () => 'unmatched',
    async port => {
      const response = await fetch(completeUrl(port));
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('no longer active');
    }
  );
});

test('answers the PNA preflight so a public https page can reach the listener', async () => {
  await withServer(
    () => 'unmatched',
    async port => {
      const response = await fetch(completeUrl(port), { method: 'OPTIONS' });
      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-private-network')).toBe(
        'true'
      );
    }
  );
});

test.each([
  `http://127.0.0.1`,
  `code=${VALID_CODE}&state=${VALID_STATE}&desktop_flow=${FLOW}&extra=x`,
])('ignores malformed or off-path requests (%s)', async suffix => {
  const onComplete = vi.fn(() => 'completed' as const);
  await withServer(onComplete, async port => {
    const url = suffix.includes('code=')
      ? `http://127.0.0.1:${port}/elsewhere?code=${VALID_CODE}&state=${VALID_STATE}&desktop_flow=${FLOW}`
      : `http://127.0.0.1:${port}/elsewhere`;
    const response = await fetch(url);
    expect(response.status).toBe(404);
    expect(onComplete).not.toHaveBeenCalled();

    const badParams = await fetch(
      `http://127.0.0.1:${port}${DESKTOP_AUTH_LOOPBACK_PATH}?code=not-a-token&state=${VALID_STATE}`
    );
    expect(badParams.status).toBe(404);
    expect(onComplete).not.toHaveBeenCalled();
  });
});

test('rejects non-GET methods', async () => {
  await withServer(
    () => 'completed',
    async port => {
      const response = await fetch(completeUrl(port), { method: 'POST' });
      expect(response.status).toBe(405);
    }
  );
});
