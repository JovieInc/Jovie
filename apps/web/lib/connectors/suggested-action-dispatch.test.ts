import { describe, expect, it } from 'vitest';
import { resolveSuggestedActionDispatch } from './suggested-action-dispatch';
import { buildYouTubeThumbnailCandidatePayload } from './youtube-thumbnail-candidate';

describe('resolveSuggestedActionDispatch', () => {
  it('normalizes a verified calendar action into the only executable mode', () => {
    expect(
      resolveSuggestedActionDispatch({
        kind: 'calendar.create_event',
        payload: {
          title: 'Soundcheck',
          startsAt: '2026-08-28T18:00:00.000Z',
          endsAt: null,
          venueName: 'The Fillmore',
          city: 'San Francisco',
        },
      })
    ).toEqual({
      mode: 'calendar-workflow',
      eventPayload: {
        title: 'Soundcheck',
        startsAt: '2026-08-28T18:00:00.000Z',
        timeZone: 'UTC',
        location: 'The Fillmore, San Francisco',
      },
    });
  });

  it('keeps the YouTube playbook decision-only', () => {
    expect(
      resolveSuggestedActionDispatch({
        kind: 'youtube.thumbnail_experiment',
        payload: { title: 'Candidate' },
      })
    ).toEqual({ mode: 'decision-only', family: 'youtube-thumbnail' });
  });

  it('requires exact evidence for a YouTube candidate decision', () => {
    const payload = buildYouTubeThumbnailCandidatePayload({
      creatorProfileId: '00000000-0000-4000-8000-000000000001',
      channelId: 'UC-owned',
      youtubeVideoId: 'video-1',
      videoTitle: 'A song',
      candidateThumbnailVersionId: '00000000-0000-4000-8000-000000000002',
      candidateImageUrl: 'https://cdn.example.com/candidate.jpg',
      currentThumbnailUrl: 'https://i.ytimg.com/current.jpg',
      artifactSha256:
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      apiMetrics: {
        source: 'youtube-analytics-api',
        window: 'lifetime',
        capturedAt: '2026-09-01T12:00:00.000Z',
        views: 1250,
        watchTimeMinutes: 300,
        avgViewDurationSeconds: 42,
        impressions: null,
        ctr: null,
      },
    });
    expect(
      resolveSuggestedActionDispatch({
        kind: 'youtube.thumbnail_candidate',
        payload,
      })
    ).toEqual({ mode: 'decision-only', family: 'youtube-thumbnail' });
    expect(
      resolveSuggestedActionDispatch({
        kind: 'youtube.thumbnail_candidate',
        payload: { title: 'Candidate' },
      })
    ).toEqual({
      mode: 'invalid',
      error: 'invalid-youtube-thumbnail-candidate',
    });
  });

  it('routes workflow capture to its dedicated handoff', () => {
    expect(
      resolveSuggestedActionDispatch({
        kind: 'workflow_capture.request',
        payload: { title: 'Record Studio' },
      })
    ).toEqual({ mode: 'workflow-capture' });
  });

  it('requires the report next-step route instead of generic approval', () => {
    expect(
      resolveSuggestedActionDispatch({
        kind: 'experiment.report',
        payload: { title: 'Result' },
      })
    ).toEqual({ mode: 'next-step-only' });
  });

  it('keeps social reply drafts decision-only so approval never sends itself', () => {
    expect(
      resolveSuggestedActionDispatch({
        kind: 'social_reply.draft',
        payload: {
          schemaVersion: 1,
          title: 'Reply to @superfan on YouTube',
          platform: 'youtube',
          sourceId: 'video-123',
          targetId: 'comment-456',
          authorLabel: '@superfan',
          inboundText: 'This track got me through the week.',
          inboundAt: '2026-09-30T14:00:00.000Z',
          draftedText: 'Means a lot — thank you for listening.',
        },
      })
    ).toEqual({ mode: 'decision-only', family: 'social-reply' });
  });

  it.each([
    ['unknown kind', 'agent.unregistered', {}, 'unsupported-action-kind'],
    [
      'malformed social reply',
      'social_reply.draft',
      { title: 'Missing draft copy' },
      'invalid-social-reply-draft',
    ],
    [
      'malformed calendar',
      'calendar.create_event',
      { title: 'Missing time' },
      'invalid-calendar-payload',
    ],
  ])('fails closed for %s', (_name, kind, payload, error) => {
    expect(resolveSuggestedActionDispatch({ kind, payload })).toEqual({
      mode: 'invalid',
      error,
    });
  });
});
