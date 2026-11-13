import { describe, expect, it } from 'vitest';
import {
  buildOpportunityInboxData,
  isCreatorReviewRenderableRow,
} from './opportunity-inbox-mapper';
import {
  BRAND_DEAL_OPPORTUNITY_KIND,
  SOCIAL_REPLY_DRAFT_KIND,
  WORKFLOW_CAPTURE_REQUEST_KIND,
  YOUTUBE_THUMBNAIL_CANDIDATE_KIND,
} from './suggested-action-kinds';

describe('isCreatorReviewRenderableRow', () => {
  const base = {
    rationale: null,
    createdAt: new Date('2026-10-02T12:00:00.000Z'),
  } as const;

  it('keeps payload-complete creator kinds renderable', () => {
    expect(
      isCreatorReviewRenderableRow({
        ...base,
        id: 'calendar-event',
        kind: 'calendar.create_event',
        payload: { title: 'Creator workflow recommendation' },
      })
    ).toBe(true);
  });

  it.each([
    [SOCIAL_REPLY_DRAFT_KIND, { title: 'Missing provenance and draft text' }],
    [WORKFLOW_CAPTURE_REQUEST_KIND, { title: 'Missing provenance' }],
    [YOUTUBE_THUMBNAIL_CANDIDATE_KIND, { title: 'Missing artifact evidence' }],
    [BRAND_DEAL_OPPORTUNITY_KIND, { title: 'Missing verification' }],
  ])(
    'drops invalid %s payloads so they never inflate creator work',
    (kind, payload) => {
      expect(
        isCreatorReviewRenderableRow({
          ...base,
          id: `bad-${kind}`,
          kind,
          payload,
        })
      ).toBe(false);
    }
  );
});

describe('buildOpportunityInboxData renderability', () => {
  it('keeps malformed social reply drafts out of the creator review surface', () => {
    const data = buildOpportunityInboxData([
      {
        id: 'social-reply-malformed',
        kind: SOCIAL_REPLY_DRAFT_KIND,
        payload: { title: 'Missing provenance and draft text' },
        rationale: 'Malformed reply draft.',
        createdAt: new Date('2026-10-02T12:00:00.000Z'),
      },
    ]);

    expect(data.cards).toEqual([]);
  });
});
