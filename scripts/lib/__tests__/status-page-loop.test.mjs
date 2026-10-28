import { describe, expect, it, vi } from 'vitest';
import { runLoop } from '../../loop-health.mjs';
import statusPage from '../../loops/status-page.mjs';

const page =
  (status, headers = {}, body = 'x'.repeat(400)) =>
  async () => ({
    status,
    headers: { get: name => headers[name.toLowerCase()] ?? null },
    text: async () => body,
  });
const run = async fetchImpl => {
  const upsertImpl = vi.fn().mockResolvedValue({ ok: true });
  const closeImpl = vi.fn().mockResolvedValue({ ok: true });
  const out = await runLoop(statusPage, {
    env: {},
    fetchImpl,
    upsertImpl,
    closeImpl,
  });
  return { ...out, upsertImpl, closeImpl };
};

describe('status-page loop', () => {
  it('files an issue when Vercel reports DEPLOYMENT_NOT_FOUND', async () => {
    const r = await run(
      page(
        404,
        { 'x-vercel-error': 'DEPLOYMENT_NOT_FOUND' },
        'The deployment could not be found'
      )
    );
    expect(r.plan.action).toBe('upsert');
    expect(r.upsertImpl).toHaveBeenCalled();
  });

  it('files an issue on a network failure', async () => {
    const r = await run(async () => {
      throw new Error('ECONNRESET');
    });
    expect(r.plan.action).toBe('upsert');
  });

  it('does not close or file when the page is healthy and no issue is open', async () => {
    const r = await run(page(200));
    expect(r.plan.action).not.toBe('upsert');
  });
});
