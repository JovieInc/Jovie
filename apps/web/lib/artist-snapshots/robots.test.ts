import { describe, expect, it } from 'vitest';
import { isPathAllowedByRobots, RobotsCache } from './robots';

const UA = 'jovie-link-ingestion/1.0 (+https://jov.ie)';

describe('robots.txt allow check', () => {
  it('allows when the file is empty', () => {
    expect(isPathAllowedByRobots('', UA, '/artist')).toBe(true);
  });

  it('honors a specific agent over a wildcard disallow', () => {
    const robots = `
User-agent: *
Disallow: /

User-agent: jovie-link-ingestion
Allow: /@artist
Disallow: /
`;
    expect(isPathAllowedByRobots(robots, UA, '/@artist/about')).toBe(true);
    expect(isPathAllowedByRobots(robots, UA, '/private')).toBe(false);
  });

  it('fails closed when robots.txt is unavailable and allows a 404', async () => {
    const unavailable = new RobotsCache(async () => ({
      status: 503,
      body: '',
    }));
    await expect(
      unavailable.decide('https://www.instagram.com/artist/', UA)
    ).resolves.toBe('unavailable');

    const missing = new RobotsCache(async () => ({ status: 404, body: '' }));
    await expect(
      missing.decide('https://www.youtube.com/@artist/about', UA)
    ).resolves.toBe('allowed');
  });
});
