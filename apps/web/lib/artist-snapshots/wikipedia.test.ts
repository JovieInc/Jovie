import { describe, expect, it } from 'vitest';
import type { MusicBrainzRelation } from '@/lib/dsp-enrichment/types';
import {
  extractWikidataQid,
  readEnwikiTitle,
  readPageviews,
  wikidataSitelinksUrl,
  wikimediaPageviewsUrl,
} from './wikipedia';

const relation = (resource: string): MusicBrainzRelation => ({
  type: 'wikidata',
  'type-id': 'wikidata',
  url: { id: 'url-1', resource },
});

describe('wikipedia pageview keys', () => {
  it('reads a Wikidata QID from MusicBrainz url-rels', () => {
    expect(
      extractWikidataQid([
        relation('https://www.youtube.com/channel/UC123'),
        relation('https://www.wikidata.org/wiki/Q42'),
      ])
    ).toBe('Q42');
    expect(extractWikidataQid([relation('https://example.com')])).toBeNull();
  });

  it('builds the Wikidata sitelink and Wikimedia pageviews URLs', () => {
    expect(wikidataSitelinksUrl('Q42')).toContain('ids=Q42');
    expect(wikidataSitelinksUrl('Q42')).toContain('sitefilter=enwiki');
    expect(wikimediaPageviewsUrl('Ada Lovelace', '2026-10-01')).toBe(
      'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia.org/all-access/user/Ada_Lovelace/daily/20261001/20261001'
    );
    expect(() => wikidataSitelinksUrl('not-a-qid')).toThrow(/QID/);
  });

  it('reads the English Wikipedia title and a daily view count', () => {
    expect(
      readEnwikiTitle(
        {
          entities: {
            Q42: { sitelinks: { enwiki: { title: 'Ada Lovelace' } } },
          },
        },
        'Q42'
      )
    ).toBe('Ada Lovelace');
    expect(readPageviews({ items: [{ views: 321 }] })).toBe(321);
    expect(readPageviews({ items: [] })).toBeNull();
  });
});
