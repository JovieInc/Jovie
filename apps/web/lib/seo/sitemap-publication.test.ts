import { describe, expect, it } from 'vitest';
import { MARKETING_ROUTE_MANIFEST } from '@/data/marketing/routeManifest';
import {
  getExactPublishedMarketingPaths,
  latestContentRevision,
  SITEMAP_PUBLISHED_LEGAL_PATHS,
  SITEMAP_PUBLISHED_MACHINE_PATHS,
  toContentRevisionDate,
} from './sitemap-publication';

describe('toContentRevisionDate', () => {
  it('copies a Date without sharing the instance', () => {
    const input = new Date('2026-04-15T00:00:00.000Z');
    const copy = toContentRevisionDate(input);

    expect(copy).toBeInstanceOf(Date);
    expect(copy).not.toBe(input);
    expect(copy?.toISOString()).toBe('2026-04-15T00:00:00.000Z');
    copy?.setUTCDate(20);
    expect(input.toISOString()).toBe('2026-04-15T00:00:00.000Z');
  });

  it('parses strings and drops values that are not dates', () => {
    expect(
      toContentRevisionDate('2026-04-15T00:00:00.000Z')?.toISOString()
    ).toBe('2026-04-15T00:00:00.000Z');
    expect(toContentRevisionDate('not-a-date')).toBeUndefined();
    expect(toContentRevisionDate(null)).toBeUndefined();
    expect(toContentRevisionDate('')).toBeUndefined();
  });

  it('picks the latest revision across mixed inputs', () => {
    const latest = latestContentRevision(
      '2026-01-01T00:00:00.000Z',
      new Date('2026-06-01T00:00:00.000Z'),
      null
    );
    expect(latest?.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('investor surfaces in the sitemap', () => {
  const INVESTOR_PATH = /^\/(?:investors|pitch|investor-portal)(?:\/|$)/u;

  it('publishes no investor, pitch or portal path', () => {
    const published = [
      ...getExactPublishedMarketingPaths(),
      ...SITEMAP_PUBLISHED_LEGAL_PATHS,
      ...SITEMAP_PUBLISHED_MACHINE_PATHS,
    ];

    expect(published.length).toBeGreaterThan(0);
    expect(published.filter(path => INVESTOR_PATH.test(path))).toEqual([]);
  });

  it('keeps no investor route in the marketing manifest at all', () => {
    expect(
      MARKETING_ROUTE_MANIFEST.filter(entry => INVESTOR_PATH.test(entry.url))
    ).toEqual([]);
  });
});
