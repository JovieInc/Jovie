import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import type { DbOrTransaction } from '@/lib/db';
import { recordAudienceEvent } from './record-audience-event';

vi.mock('./activity-grammar', () => ({
  getAudienceEventSentenceText: () => 'Played',
}));
vi.mock('./source-links', () => ({ isRecentSourceScanDuplicate: vi.fn() }));

describe('audience event provenance', () => {
  it('binds the normalized event and projection to one ID and one timestamp', async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const set = vi
      .fn()
      .mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    const tx = {
      insert: vi.fn().mockReturnValue({ values }),
      update: vi.fn().mockReturnValue({ set }),
    };
    await recordAudienceEvent(tx as unknown as DbOrTransaction, {
      creatorProfileId: 'profile',
      audienceMemberId: 'member',
      eventType: 'profile_visited',
    });
    const event = values.mock.calls[0][0];
    expect(event.id).toMatch(/^[0-9a-f-]{36}$/);
    const query = new PgDialect().sqlToQuery(
      set.mock.calls[0][0].latestActions
    );
    const projection = JSON.parse(
      query.params.find(
        value => typeof value === 'string' && value.startsWith('{')
      ) as string
    );
    expect(projection).toMatchObject({
      eventId: event.id,
      timestamp: event.timestamp.toISOString(),
    });
  });
});
