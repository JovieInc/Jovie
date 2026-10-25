import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ run: vi.fn(), verify: vi.fn() }));

vi.mock('@/lib/cron/auth', () => ({ verifyCronRequest: mocks.verify }));
vi.mock('@/lib/discography/catalog-completeness', () => ({
  runCatalogCompleteness: mocks.run,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

import { GET } from '@/app/api/cron/catalog-completeness/route';

const totals = {
  profiles: 1,
  publicBefore: 18,
  publicAfter: 22,
  approvalsPublished: 4,
  imported: 24,
  failed: 0,
};

describe('catalog-completeness cron', () => {
  beforeEach(() => {
    mocks.run.mockReset();
    mocks.verify.mockReset().mockReturnValue(null);
  });

  it('rejects unauthorized requests without running', async () => {
    mocks.verify.mockReturnValue(new Response('no', { status: 401 }));
    const res = await GET(
      new Request('https://x.test/api/cron/catalog-completeness')
    );
    expect(res.status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('passes handles through and reports counts', async () => {
    mocks.run.mockResolvedValue({ profiles: [], totals });
    const res = await GET(
      new Request(
        'https://x.test/api/cron/catalog-completeness?handles=tim, other'
      )
    );
    expect(mocks.run).toHaveBeenCalledWith(
      expect.objectContaining({ handles: ['tim', 'other'] })
    );
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.totals.publicAfter).toBe(22);
  });

  it('returns 500 when the sweep throws', async () => {
    mocks.run.mockRejectedValue(new Error('boom'));
    const res = await GET(
      new Request('https://x.test/api/cron/catalog-completeness')
    );
    expect(res.status).toBe(500);
  });
});
