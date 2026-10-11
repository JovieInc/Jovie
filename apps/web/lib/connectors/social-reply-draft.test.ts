import { describe, expect, it } from 'vitest';
import {
  buildSocialReplyRevisionPayload,
  parseSocialReplyDraft,
  socialReplyDraftPayloadSchema,
} from './social-reply-draft';

const BASE_PAYLOAD = {
  schemaVersion: 1,
  title: 'Reply to @superfan on YouTube',
  platform: 'youtube',
  sourceId: 'video-123',
  targetId: 'comment-456',
  authorLabel: '@superfan',
  authorKind: 'fan',
  inboundText: 'This track got me through the week, thank you.',
  inboundAt: '2026-09-30T14:00:00.000Z',
  draftedText: 'Means a lot — thank you for listening.',
  sourceUrl: 'https://youtube.com/watch?v=abc&lc=comment-456',
};

describe('socialReplyDraftPayloadSchema', () => {
  it('parses a complete draft payload and applies defaults', () => {
    const parsed = socialReplyDraftPayloadSchema.parse(BASE_PAYLOAD);
    expect(parsed.authorKind).toBe('fan');
    expect(parsed.executionState).toBe('pending');
    expect(parsed.revisions).toEqual([]);
    expect(parsed.revisionOf).toBeNull();
  });

  it('rejects a draft without draft copy', () => {
    expect(
      socialReplyDraftPayloadSchema.safeParse({
        ...BASE_PAYLOAD,
        draftedText: '   ',
      }).success
    ).toBe(false);
  });

  it('covers the named execution progress states', () => {
    for (const state of [
      'checking',
      'sending',
      'verified',
      'blocked',
      'ambiguous',
    ]) {
      expect(
        socialReplyDraftPayloadSchema.parse({
          ...BASE_PAYLOAD,
          executionState: state,
        }).executionState
      ).toBe(state);
    }
  });
});

describe('parseSocialReplyDraft', () => {
  it('returns the payload only for the social_reply.draft kind', () => {
    expect(
      parseSocialReplyDraft('social_reply.draft', BASE_PAYLOAD)?.authorLabel
    ).toBe('@superfan');
    expect(parseSocialReplyDraft('calendar.create_event', BASE_PAYLOAD)).toBe(
      null
    );
    expect(
      parseSocialReplyDraft('social_reply.draft', { title: 'incomplete' })
    ).toBe(null);
  });
});

describe('buildSocialReplyRevisionPayload', () => {
  it('appends durable feedback and preserves the replaced draft', () => {
    const draft = socialReplyDraftPayloadSchema.parse(BASE_PAYLOAD);
    const revised = buildSocialReplyRevisionPayload(draft, {
      feedback: 'Make it warmer and mention the new single.',
      revisedAt: '2026-10-01T09:00:00.000Z',
      revisedFromActionId: 'action-1',
    });

    expect(revised.draftedText).toBe(draft.draftedText);
    expect(revised.executionState).toBe('pending');
    expect(revised.revisionOf).toBe('action-1');
    expect(revised.revisions).toEqual([
      {
        feedback: 'Make it warmer and mention the new single.',
        revisedAt: '2026-10-01T09:00:00.000Z',
        draftedText: 'Means a lot — thank you for listening.',
      },
    ]);
  });

  it('keeps the chain root as revisionOf across rounds and accepts new copy', () => {
    const first = buildSocialReplyRevisionPayload(
      socialReplyDraftPayloadSchema.parse(BASE_PAYLOAD),
      {
        feedback: 'Too stiff.',
        revisedAt: '2026-10-01T09:00:00.000Z',
        revisedFromActionId: 'action-1',
      }
    );
    const second = buildSocialReplyRevisionPayload(first, {
      feedback: 'Still too stiff, drop the formal opener.',
      revisedAt: '2026-10-01T10:00:00.000Z',
      revisedFromActionId: 'action-2',
      draftedText: 'So glad it hit home.',
    });

    expect(second.revisionOf).toBe('action-1');
    expect(second.revisions).toHaveLength(2);
    expect(second.revisions[1].draftedText).toBe(first.draftedText);
    expect(second.draftedText).toBe('So glad it hit home.');
  });
});
