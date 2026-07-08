import { describe, expect, it } from 'vitest';
import {
  buildCanonicalQuestions,
  type CitationResult,
  classifyCitationTrend,
  computeCitationStats,
  formatShareOfCitation,
  parseCitationResponse,
} from '@/lib/aeo/citation-monitor';

describe('buildCanonicalQuestions', () => {
  it('returns questions for all four categories', () => {
    const questions = buildCanonicalQuestions('Billie Eilish');
    const categories = new Set(questions.map(q => q.category));
    expect(categories.has('identity')).toBe(true);
    expect(categories.has('release')).toBe(true);
    expect(categories.has('touring')).toBe(true);
    expect(categories.has('merch')).toBe(true);
  });

  it('interpolates the artist name into every question', () => {
    const name = 'Test Artist';
    const questions = buildCanonicalQuestions(name);
    for (const q of questions) {
      expect(q.question).toContain(name);
    }
  });

  it('returns at least 4 distinct questions', () => {
    const questions = buildCanonicalQuestions('DJ Shadow');
    const unique = new Set(questions.map(q => q.question));
    expect(unique.size).toBeGreaterThanOrEqual(4);
  });
});

describe('parseCitationResponse', () => {
  const profileUrl = 'https://jov.ie/billie-eilish';

  it('detects an exact URL match in plain text', () => {
    const response = `According to jov.ie, Billie Eilish is from Los Angeles.
    Source: https://jov.ie/billie-eilish`;
    const result = parseCitationResponse(response, profileUrl);
    expect(result.cited).toBe(true);
    expect(result.matchedUrl).toBe('https://jov.ie/billie-eilish');
  });

  it('detects a URL inside a markdown link', () => {
    const response = `Learn more at [Billie Eilish on Jovie](https://jov.ie/billie-eilish).`;
    const result = parseCitationResponse(response, profileUrl);
    expect(result.cited).toBe(true);
  });

  it('returns not cited when no URL matches', () => {
    const response = `Billie Eilish is a Grammy-winning artist. See Wikipedia for details.`;
    const result = parseCitationResponse(response, profileUrl);
    expect(result.cited).toBe(false);
    expect(result.matchedUrl).toBeNull();
  });

  it('handles empty response gracefully', () => {
    const result = parseCitationResponse('', profileUrl);
    expect(result.cited).toBe(false);
  });

  it('handles empty profileUrl gracefully', () => {
    const result = parseCitationResponse('some text', '');
    expect(result.cited).toBe(false);
  });

  it('does not match a different artist URL on the same domain', () => {
    const response = `Check out https://jov.ie/some-other-artist for more.`;
    const result = parseCitationResponse(response, profileUrl);
    expect(result.cited).toBe(false);
  });

  it('matches URL with trailing slash in response', () => {
    const response = `Visit https://jov.ie/billie-eilish/ for the profile.`;
    const result = parseCitationResponse(response, profileUrl);
    expect(result.cited).toBe(true);
  });

  it('matches URL with a sub-path (release page)', () => {
    const response = `See the album at https://jov.ie/billie-eilish/hit-me-hard.`;
    const result = parseCitationResponse(response, profileUrl);
    expect(result.cited).toBe(true);
  });

  it('is case-insensitive for the URL comparison', () => {
    const response = `Source: https://JOV.IE/BILLIE-EILISH`;
    const result = parseCitationResponse(response, profileUrl);
    expect(result.cited).toBe(true);
  });

  it('strips trailing punctuation from extracted URLs', () => {
    const response = `Read more at https://jov.ie/billie-eilish.`;
    const result = parseCitationResponse(response, profileUrl);
    expect(result.cited).toBe(true);
  });
});

describe('computeCitationStats', () => {
  it('returns zero stats for empty results', () => {
    const stats = computeCitationStats([]);
    expect(stats.totalChecks).toBe(0);
    expect(stats.citedCount).toBe(0);
    expect(stats.shareOfCitation).toBe(0);
    expect(stats.byEngine).toHaveLength(0);
  });

  const baseResult = (
    cited: boolean,
    engine: CitationResult['engine'] = 'perplexity'
  ): CitationResult => ({
    engine,
    question: 'Who is Test Artist?',
    profileUrl: 'https://jov.ie/test-artist',
    cited,
    matchedUrl: cited ? 'https://jov.ie/test-artist' : null,
    checkedAt: '2026-06-18T00:00:00.000Z',
  });

  it('computes 100% share-of-citation when all cited', () => {
    const results = [baseResult(true), baseResult(true), baseResult(true)];
    const stats = computeCitationStats(results);
    expect(stats.shareOfCitation).toBe(1);
    expect(stats.citedCount).toBe(3);
  });

  it('computes 0% when none cited', () => {
    const stats = computeCitationStats([baseResult(false), baseResult(false)]);
    expect(stats.shareOfCitation).toBe(0);
  });

  it('computes correct share for partial citation', () => {
    const results = [
      baseResult(true),
      baseResult(false),
      baseResult(false),
      baseResult(true),
    ];
    const stats = computeCitationStats(results);
    expect(stats.shareOfCitation).toBe(0.5);
  });

  it('breaks down stats per engine', () => {
    const results: CitationResult[] = [
      baseResult(true, 'perplexity'),
      baseResult(false, 'perplexity'),
      baseResult(true, 'chatgpt'),
    ];
    const stats = computeCitationStats(results);
    expect(stats.byEngine).toHaveLength(2);

    const perplexity = stats.byEngine.find(e => e.engine === 'perplexity');
    expect(perplexity?.totalChecks).toBe(2);
    expect(perplexity?.citedCount).toBe(1);
    expect(perplexity?.shareOfCitation).toBe(0.5);

    const chatgpt = stats.byEngine.find(e => e.engine === 'chatgpt');
    expect(chatgpt?.citedCount).toBe(1);
    expect(chatgpt?.shareOfCitation).toBe(1);
  });
});

describe('formatShareOfCitation', () => {
  it('formats 1 as 100%', () => {
    expect(formatShareOfCitation(1)).toBe('100%');
  });

  it('formats 0 as 0%', () => {
    expect(formatShareOfCitation(0)).toBe('0%');
  });

  it('formats 0.667 correctly', () => {
    expect(formatShareOfCitation(0.667)).toBe('66.7%');
  });

  it('handles negative input gracefully', () => {
    expect(formatShareOfCitation(-0.5)).toBe('0%');
  });
});

describe('classifyCitationTrend', () => {
  it('returns up when current significantly exceeds previous', () => {
    expect(classifyCitationTrend(0.8, 0.5)).toBe('up');
  });

  it('returns down when current is significantly below previous', () => {
    expect(classifyCitationTrend(0.3, 0.7)).toBe('down');
  });

  it('returns steady when difference is within 5pp', () => {
    // Use values with delta clearly < 0.05 to avoid floating-point ambiguity
    expect(classifyCitationTrend(0.54, 0.5)).toBe('steady'); // delta = 0.04
    expect(classifyCitationTrend(0.5, 0.52)).toBe('steady'); // delta = -0.02
  });

  it('returns steady for equal values', () => {
    expect(classifyCitationTrend(0.5, 0.5)).toBe('steady');
  });
});
