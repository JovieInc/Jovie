import { beforeEach, describe, expect, it, vi } from 'vitest';

const { select, insert, idempotency } = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  idempotency: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: { select, insert } }));
vi.mock('@/lib/idempotency', () => ({ tryWithIdempotency: idempotency }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  buildCampaignNotificationMetadata,
  scheduleCampaignFanNotifications,
} from './campaign-scheduling';

describe('direct campaign audience scheduling denial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    select.mockImplementation(() => {
      throw new Error('must not read audience');
    });
    insert.mockImplementation(() => {
      throw new Error('must not insert audience jobs');
    });
    idempotency.mockImplementation(() => {
      throw new Error('must not acquire a scheduling lock');
    });
  });

  it.each(['all', 'highIntent', 'alertsOn'] as const)(
    'blocks approved bulk segment %s and alternate channel metadata',
    async segment => {
      const input = {
        creatorProfileId: 'synthetic-creator',
        campaignId: 'synthetic-campaign',
        segment,
        scheduledFor: new Date('2026-10-08T00:00:00Z'),
        releaseId: 'synthetic-release',
        metadata: {
          approved: true,
          bypass: true,
          channel: 'sms',
          recipient: 'different',
          draftBody: 'edited',
        },
      };
      const result = await scheduleCampaignFanNotifications(input);
      expect(result).toMatchObject({
        scheduled: 0,
        deduped: 0,
        policyBlocked: {
          reason: 'audience_delivery_disabled',
          retryable: false,
          dispatchAllowed: false,
          queueDisposition: 'do_not_enqueue_or_retry',
        },
      });
      await scheduleCampaignFanNotifications({
        ...input,
        metadata: { channel: 'email' },
      });
      expect(select).not.toHaveBeenCalled();
      expect(insert).not.toHaveBeenCalled();
      expect(idempotency).not.toHaveBeenCalled();
    }
  );

  it('refuses before reading caller-controlled targeting properties', async () => {
    const getter = vi.fn(() => {
      throw new Error('target must not be read');
    });
    const input = {
      get creatorProfileId() {
        return getter();
      },
      campaignId: 'synthetic',
      segment: 'all' as const,
      scheduledFor: new Date(),
      releaseId: 'synthetic',
    };
    expect(await scheduleCampaignFanNotifications(input)).toMatchObject({
      policyBlocked: { dispatchAllowed: false },
    });
    expect(getter).not.toHaveBeenCalled();
    expect(idempotency).not.toHaveBeenCalled();
  });

  it('preserves local draft metadata preparation without dispatch effects', () => {
    const metadata = buildCampaignNotificationMetadata({
      campaignTitle: 'Draft',
      ctaUrl: 'https://example.invalid/release',
      draftBody: 'Review this draft',
    });
    expect(metadata).toMatchObject({
      campaignTitle: 'Draft',
      draftBody: 'Review this draft',
      ctaUrl: 'https://example.invalid/release',
    });
    expect(select).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(idempotency).not.toHaveBeenCalled();
  });
});
