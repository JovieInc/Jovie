import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));

import { HOST_RULES } from '@/lib/leads/buyer-signal-rules';
import { prescreenBuyer, prescreenFailReason } from '@/lib/leads/buyer-signals';
import {
  buildSearchEvidence,
  buildToolSearchQueries,
  MAX_SEARCH_EVIDENCE_PER_LEAD,
  mergeSearchEvidence,
  qualifyFromSearchEvidence,
} from '@/lib/leads/search-evidence';
import {
  DISCOVERY_SEED_KEYWORDS,
  FEATURE_FM_SEED_KEYWORDS,
} from '@/lib/leads/seed-keywords';

const at = new Date('2026-11-08T00:00:00.000Z');

describe('buildToolSearchQueries', () => {
  const queries = buildToolSearchQueries();

  it('searches every paid-tool and budget rule the pre-screen scores, on Linktree and Beacons', () => {
    const spendRules = HOST_RULES.filter(
      rule => rule.category !== 'activity' && !rule.path
    );
    expect(queries).toHaveLength(spendRules.length * 2);
    for (const rule of spendRules) {
      expect(queries).toContain(`site:linktr.ee "${rule.hosts[0]}"`);
      expect(queries).toContain(`site:beacons.ai "${rule.hosts[0]}"`);
    }
    expect(queries).toContain('site:linktr.ee "bandsintown.com"');
    expect(queries).toContain('site:beacons.ai "laylo.com"');
    expect(new Set(queries).size).toBe(queries.length);
  });

  it('skips activity footprints and rules a domain alone cannot name', () => {
    expect(queries.some(q => q.includes('songwhip.com'))).toBe(false);
    expect(queries.some(q => q.includes('distrokid.com'))).toBe(false);
  });

  it('is seeded alongside the Feature.fm keywords without duplicates', () => {
    for (const query of [...FEATURE_FM_SEED_KEYWORDS, ...queries]) {
      expect(DISCOVERY_SEED_KEYWORDS).toContain(query);
    }
    expect(new Set(DISCOVERY_SEED_KEYWORDS).size).toBe(
      DISCOVERY_SEED_KEYWORDS.length
    );
  });
});

describe('buildSearchEvidence', () => {
  it('records the tool a quoted SerpAPI query matched, with the query', () => {
    expect(
      buildSearchEvidence({
        query: 'site:beacons.ai "laylo.com"',
        provider: 'serpapi',
        title: 'Fixture Artist | Beacons',
        snippet: ' Drops and merch ',
        observedAt: at,
      })
    ).toEqual({
      source: 'search_match',
      query: 'site:beacons.ai "laylo.com"',
      provider: 'serpapi',
      tools: ['laylo'],
      domains: ['laylo.com'],
      title: 'Fixture Artist',
      snippet: 'Drops and merch',
      observedAt: at.toISOString(),
    });
  });

  it('credits no tool for Exa, which ignores quotes, or for the link-page host', () => {
    expect(
      buildSearchEvidence({
        query: 'site:linktr.ee "laylo.com"',
        provider: 'exa',
        title: null,
        snippet: null,
      }).tools
    ).toEqual([]);
    expect(
      buildSearchEvidence({
        query: '"linktr.ee" "beacons.ai" artist',
        provider: 'serpapi',
        title: null,
        snippet: null,
      }).domains
    ).toEqual([]);
  });
});

describe('mergeSearchEvidence', () => {
  const entry = (query: string, tools: string[]) =>
    buildSearchEvidence({
      query,
      provider: 'serpapi',
      title: null,
      snippet: tools.join(' '),
      observedAt: at,
    });

  it('accumulates a lead seen under several tool queries', () => {
    const laylo = entry('site:linktr.ee "laylo.com"', ['laylo']);
    const ffm = entry('site:linktr.ee "ffm.to"', ['featurefm']);
    expect(mergeSearchEvidence([laylo], [ffm]).map(e => e.tools)).toEqual([
      ['laylo'],
      ['featurefm'],
    ]);
  });

  it('replaces a query seen again instead of counting it twice', () => {
    const older = entry('site:linktr.ee "laylo.com"', ['old']);
    const newer = entry('site:linktr.ee "laylo.com"', ['new']);
    expect(mergeSearchEvidence([older], [newer])).toEqual([newer]);
  });

  it('keeps at most the newest entries per lead', () => {
    const many = Array.from(
      { length: MAX_SEARCH_EVIDENCE_PER_LEAD + 5 },
      (_, i) => entry(`site:linktr.ee "tool${i}.com"`, [])
    );
    const merged = mergeSearchEvidence(many.slice(0, 10), many.slice(10));
    expect(merged).toHaveLength(MAX_SEARCH_EVIDENCE_PER_LEAD);
    expect(merged.at(-1)).toEqual(many.at(-1));
  });
});

describe('qualifyFromSearchEvidence', () => {
  const tool = (query: string, snippet: string | null = null) =>
    buildSearchEvidence({
      query,
      provider: 'serpapi',
      title: 'Fixture Artist | Linktree',
      snippet,
      observedAt: at,
    });

  it('makes no decision without evidence', () => {
    expect(
      qualifyFromSearchEvidence({
        handle: 'x',
        displayName: null,
        evidence: [],
      })
    ).toEqual({ outcome: 'no_evidence' });
    expect(
      qualifyFromSearchEvidence({
        handle: 'x',
        displayName: null,
        evidence: undefined,
      })
    ).toEqual({ outcome: 'no_evidence' });
  });

  it('scores with the same pre-screen discovery uses', () => {
    const evidence = [
      tool('site:linktr.ee "ffm.to"'),
      tool('site:linktr.ee "myshopify.com"'),
    ];
    const decision = qualifyFromSearchEvidence({
      handle: 'fixture_artist',
      displayName: null,
      evidence,
    });
    const direct = prescreenBuyer(
      {
        handle: 'fixture_artist',
        displayName: 'Fixture Artist',
        bio: null,
        text: 'ffm.to myshopify.com',
        links: [],
      },
      { pageSeenInFull: false }
    );
    expect(decision).toMatchObject({
      outcome: 'qualified',
      fitScore: direct.score,
      displayName: 'Fixture Artist',
      musicToolsDetected: ['featurefm'],
    });
    expect(direct.score).toBe(40);
  });

  it('labels a spend signal under the pass mark score_below_threshold', () => {
    const decision = qualifyFromSearchEvidence({
      handle: 'fixture_artist',
      displayName: null,
      evidence: [tool('site:linktr.ee "bandsintown.com"')],
    });
    expect(decision).toMatchObject({
      outcome: 'disqualified',
      fitScore: 15,
      disqualificationReason: 'score_below_threshold',
    });
  });

  it('keeps the pre-screen hard stops', () => {
    const decision = qualifyFromSearchEvidence({
      handle: 'fixture_artist',
      displayName: null,
      evidence: [tool('site:linktr.ee "laylo.com"', 'Join us on jov.ie')],
    });
    expect(decision).toMatchObject({
      outcome: 'disqualified',
      disqualificationReason: 'already_on_jovie',
    });
  });
});

describe('prescreenFailReason', () => {
  const page = (bio: string) => ({
    handle: 'fixture',
    displayName: 'Fixture',
    bio,
    links: [],
  });

  it('separates a low score with spend from no spend at all', () => {
    const lowScore = prescreenBuyer(page('Tour dates'), {
      pageSeenInFull: false,
    });
    expect(lowScore.hasSpend).toBe(true);
    expect(prescreenFailReason(lowScore)).toBe('score_below_threshold');

    const noSpend = prescreenBuyer(page('Spotify'), { pageSeenInFull: false });
    expect(noSpend.hasSpend).toBe(false);
    expect(prescreenFailReason(noSpend)).toBe('no_spend_signal');
  });
});
