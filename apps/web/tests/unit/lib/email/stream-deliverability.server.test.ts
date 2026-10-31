import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMAIL_STREAM_REGISTRY } from '@/lib/email/streams';

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { execute: mocks.execute } }));
vi.mock('@/lib/env-server', () => ({
  env: { EMAIL_STREAM_FOUNDER_DOMAIN: 'founder.example.com' },
}));

import { loadStreamDeliverability } from '@/lib/email/stream-deliverability.server';

describe('loadStreamDeliverability', () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(['rows', 'array'])(
    'summarizes %s driver results using configured stream domains',
    async shape => {
      const rows = [
        {
          senderDomain: 'founder.example.com',
          status: 'delivered',
          count: 100,
        },
        { senderDomain: 'founder.example.com', status: 'bounced', count: 5 },
      ];
      mocks.execute.mockResolvedValue(shape === 'rows' ? { rows } : rows);
      const report = await loadStreamDeliverability(new Date(0));
      expect(mocks.execute).toHaveBeenCalledTimes(1);
      expect(report.generatedAt).toBe('1970-01-01T00:00:00.000Z');
      expect(report.windowDays).toBe(
        EMAIL_STREAM_REGISTRY.deliverability.windowDays
      );
      expect(report.domains).toEqual([
        expect.objectContaining({
          domain: 'founder.example.com',
          stream: 'founder',
          delivered: 100,
          bounced: 5,
          status: 'breach',
          bounceRate: 5 / 105,
        }),
      ]);
      expect(report.ok).toBe(false);
    }
  );

  it('does not claim a clean report when the database cannot be read', async () => {
    const error = new Error('connection failed');
    mocks.execute.mockRejectedValue(error);
    await expect(loadStreamDeliverability()).rejects.toBe(error);
  });
});
