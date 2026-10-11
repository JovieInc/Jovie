import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getGbrainHealth } from '@/lib/hud/gbrain-health';

const URL = 'https://memory-health.example/health';

function respond(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe('getGbrainHealth', () => {
  it('is absent when the health door is not configured', async () => {
    const fetchImpl = vi.fn();
    await expect(
      getGbrainHealth(undefined, fetchImpl)
    ).resolves.toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports ok with the version from a healthy door', async () => {
    const health = await getGbrainHealth(
      URL,
      respond(200, { status: 'ok', version: '0.46.28.0', engine: 'postgres' })
    );
    expect(health).toMatchObject({ status: 'ok', version: '0.46.28.0' });
  });

  it('reports down for a non-ok body, an error status, or no answer', async () => {
    await expect(
      getGbrainHealth(URL, respond(200, { status: 'degraded' }))
    ).resolves.toMatchObject({ status: 'down' });
    await expect(getGbrainHealth(URL, respond(503, {}))).resolves.toMatchObject(
      { status: 'down', version: null }
    );
    await expect(
      getGbrainHealth(
        URL,
        vi.fn(async () => {
          throw new TypeError('fetch failed');
        })
      )
    ).resolves.toMatchObject({ status: 'down' });
  });
});
