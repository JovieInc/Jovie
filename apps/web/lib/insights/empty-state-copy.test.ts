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
});
