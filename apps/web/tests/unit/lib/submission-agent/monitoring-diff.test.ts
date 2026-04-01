import { describe, expect, it } from 'vitest';
import { diffSubmissionMonitoringData } from '@/lib/submission-agent/monitoring/diff';

describe('diffSubmissionMonitoringData', () => {
  it('separates deterministic mismatches from review-required changes', () => {
    const issues = diffSubmissionMonitoringData(
      {
        releaseTitle: 'Correct Title',
        releaseDate: '2026-03-01',
        upc: '123',
        trackCount: 3,
        hasCredits: true,
        hasBio: true,
        hasArtistImage: true,
        hasArtwork: true,
      },
      {
        releaseTitle: 'Wrong Title',
        releaseDate: '2026-03-01',
        upc: '123',
        trackCount: 2,
        hasCredits: false,
        hasBio: false,
        hasArtistImage: false,
        hasArtwork: false,
      }
    );

    expect(
      issues
        .filter(issue => issue.issueType === 'mismatch')
        .map(issue => issue.field)
    ).toEqual(
      expect.arrayContaining([
        'releaseTitle',
        'trackCount',
        'credits',
        'artwork',
      ])
    );
    expect(
      issues
        .filter(issue => issue.issueType === 'review_required')
        .map(issue => issue.field)
    ).toEqual(expect.arrayContaining(['bio', 'artistImage']));
  });
});
