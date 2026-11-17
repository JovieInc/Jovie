import { describe, expect, it } from 'vitest';
import { getInsightsEmptyCopy } from './empty-state-copy';

describe('getInsightsEmptyCopy', () => {
  it('names the click threshold before anything has been generated', () => {
    const copy = getInsightsEmptyCopy({});
    expect(copy.mode).toBe('start');
    expect(copy.heading).toBe('No Insights Yet');
    expect(copy.description).toContain('at least 20 link clicks');
    expect(copy.description).not.toMatch(/AI-powered|actionable trends/i);
  });

  it('reports the real count after a run that was short of data', () => {
    const copy = getInsightsEmptyCopy({
      lastRun: { insightsGenerated: 0, dataPointsAnalyzed: 4 },
    });
    expect(copy.mode).toBe('needs-activity');
    expect(copy.heading).toBe('Not Enough Activity Yet');
    expect(copy.description).toBe(
      'Insights start at 20 link clicks, and your profile has 4 link clicks so far. Share it, then generate again once more fans visit.'
    );
  });

  it('uses the singular for one click', () => {
    expect(
      getInsightsEmptyCopy({
        lastRun: { insightsGenerated: 0, dataPointsAnalyzed: 1 },
      }).description
    ).toContain('has 1 link click so far');
  });

  it('says nothing changed when a run had enough data but found nothing', () => {
    const copy = getInsightsEmptyCopy({
      lastRun: { insightsGenerated: 0, dataPointsAnalyzed: 1200 },
    });
    expect(copy.mode).toBe('nothing-new');
    expect(copy.description).toContain('read 1,200 link clicks');
  });

  it('says plainly when generation failed', () => {
    const copy = getInsightsEmptyCopy({
      lastRun: { insightsGenerated: 0, dataPointsAnalyzed: 2 },
      generateFailed: true,
    });
    expect(copy.mode).toBe('failed');
    expect(copy.heading).toBe('Insights Did Not Generate');
  });

  it('turns a 429 into cooldown copy with the end time when sent', () => {
    const copy = getInsightsEmptyCopy({
      generateFailure: {
        status: 429,
        nextAllowedAt: '2026-11-08T15:30:00.000Z',
      },
    });
    expect(copy.mode).toBe('rate-limited');
    expect(copy.description).toMatch(/You can generate again after /);
  });

  it('turns a 403 into plan copy', () => {
    const copy = getInsightsEmptyCopy({ generateFailure: { status: 403 } });
    expect(copy.mode).toBe('needs-plan');
  });

  it('keeps a failure ahead of the category filter', () => {
    const copy = getInsightsEmptyCopy({
      generateFailure: { status: 500 },
      categoryLabel: 'Tour',
    });
    expect(copy.mode).toBe('failed');
  });

  it('names the filtered category when it is empty', () => {
    const copy = getInsightsEmptyCopy({ categoryLabel: 'Revenue' });
    expect(copy).toMatchObject({
      mode: 'category-empty',
      heading: 'No Revenue Insights Yet',
    });
  });

  it('treats a lost reply (timeout or network drop) as still working', () => {
    for (const failure of [
      { status: 408, kind: 'deadline' },
      { status: 0, kind: 'network' },
    ]) {
      expect(getInsightsEmptyCopy({ generateFailure: failure }).mode).toBe(
        'still-working'
      );
    }
  });
});
