import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/auth/profile-access', () => ({
  getExactProfileAccess: vi.fn(),
}));

import {
  buildSocialReplySuggestedActionRows,
  SOCIAL_REPLY_ACTION_KIND,
} from './stage-actions';

const batch = {
  batchId: 'tim-youtube-001',
  mode: 'draft' as const,
  targets: [
    {
      platform: 'youtube',
      sourceId: 'video-1',
      targetId: 'comment-1',
      draftedText: 'Thank you for listening.',
      sourceKind: 'owned-audience' as const,
      sourceUrl: 'https://youtube.com/watch?v=video-1',
      baselineMetadata: { subscriberCount: 24_100 },
    },
  ],
};

describe('buildSocialReplySuggestedActionRows', () => {
  it('builds deterministic pending Inbox rows with source receipts', () => {
    const first = buildSocialReplySuggestedActionRows('user-1', batch);
    const second = buildSocialReplySuggestedActionRows('user-1', batch);

    expect(first).toEqual(second);
    expect(first[0]).toMatchObject({
      kind: SOCIAL_REPLY_ACTION_KIND,
      signalType: 'fan_reply',
      idempotencyKey: 'social.reply:user-1:youtube:comment-1',
      rationale: 'An unanswered fan comment has a reply ready for review.',
    });
    expect(first[0]?.payload).toMatchObject({
      batchId: 'tim-youtube-001',
      platform: 'youtube',
      sourceId: 'video-1',
      targetId: 'comment-1',
      draftedText: 'Thank you for listening.',
      baselineMetadata: { subscriberCount: 24_100 },
    });
    expect(first[0]?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it('uses a different durable identity for a different target', () => {
    const first = buildSocialReplySuggestedActionRows('user-1', batch)[0];
    const second = buildSocialReplySuggestedActionRows('user-1', {
      ...batch,
      targets: [{ ...batch.targets[0], targetId: 'comment-2' }],
    })[0];

    expect(first?.id).not.toBe(second?.id);
    expect(first?.idempotencyKey).not.toBe(second?.idempotencyKey);
  });
});
