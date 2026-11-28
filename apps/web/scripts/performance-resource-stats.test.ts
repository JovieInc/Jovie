import { describe, expect, it } from 'vitest';
import {
  formatLargestResources,
  largestResourcesByType,
  nearestRankPercentile,
} from './performance-resource-stats';

describe('largestResourcesByType', () => {
  it('keeps the three heaviest requests per type and drops query strings', () => {
    const result = largestResourcesByType([
      { size: 1024, type: 'image', url: 'https://cdn.example/a.png?token=x' },
      {
        size: 46 * 1024,
        type: 'image',
        url: 'https://blob.example/avatar.jpg#f',
      },
      { size: 2048, type: 'image', url: 'https://cdn.example/b.png' },
      { size: 3072, type: 'image', url: 'https://cdn.example/c.png' },
      { size: 0, type: 'script', url: 'https://cdn.example/cached.js' },
    ]);
    expect(result.image).toEqual([
      { kb: 46, url: 'https://blob.example/avatar.jpg' },
      { kb: 3, url: 'https://cdn.example/c.png' },
      { kb: 2, url: 'https://cdn.example/b.png' },
    ]);
    expect(result.script).toEqual([]);
  });
});

describe('formatLargestResources', () => {
  const samples = [
    {},
    {
      largestResources: {
        image: [{ kb: 46.3, url: 'https://blob.example/avatar.jpg' }],
        script: [{ kb: 120, url: 'https://jov.ie/_next/static/chunks/app.js' }],
      },
    },
  ];

  it('names the heaviest images behind a failed image budget', () => {
    expect(formatLargestResources(samples, 'image')).toEqual([
      '      46.3KB https://blob.example/avatar.jpg',
    ]);
  });

  it('ranks every type for the total budget', () => {
    expect(formatLargestResources(samples, 'total')).toEqual([
      '      120.0KB https://jov.ie/_next/static/chunks/app.js',
      '      46.3KB https://blob.example/avatar.jpg',
    ]);
  });

  it('prints nothing when no sample recorded resources', () => {
    expect(formatLargestResources([{}], 'image')).toEqual([]);
  });
});

describe('nearestRankPercentile', () => {
  it('is re-exported unchanged from the guard helpers', () => {
    expect(nearestRankPercentile([5, 1, 3, 2, 4], 95)).toBe(5);
  });
});
