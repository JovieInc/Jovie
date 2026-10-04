import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildCanonicalQuestions } from '@/lib/aeo/citation-monitor';
import { ARTIST_VISIBILITY_OFFER } from '@/lib/config/plan-prices';
import { DSP_REGISTRY } from '@/lib/dsp-registry';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';
import { assembleVisibilityAudit } from './assemble';
import { findDerivedSpotifyMetricKeys } from './derived-metrics';
import { dspKeyForUrl } from './dsp-presence';
import { ALLMUSIC_SUBMISSION_PROVIDER_ID } from './fixes';
import { TIM_WHITE_VISIBILITY_AUDIT_INPUT } from './fixtures/tim-white';
import { renderVisibilityAuditMarkdown } from './render-markdown';
import type { VisibilityAuditInput } from './types';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function withInput(
  overrides: Partial<VisibilityAuditInput>
): VisibilityAuditInput {
  return {
    ...TIM_WHITE_VISIBILITY_AUDIT_INPUT,
    ...overrides,
  };
}

describe('visibility audit', () => {
  it.each([
    { cited: [], expected: '0%' },
    { cited: [false, false], expected: '0%' },
    { cited: [true, false], expected: '50%' },
    { cited: [true, true, false], expected: '66.7%' },
  ])('renders citation share as $expected', ({ cited, expected }) => {
    const question = buildCanonicalQuestions('Tim White')[0]!.question;
    const report = assembleVisibilityAudit(
      withInput({
        citationChecks: cited.map(value => ({
          engine: 'chatgpt',
          question,
          cited: value,
          matchedUrl: value ? 'https://jov.ie/tim' : null,
          checkedAt: '2026-10-04T03:00:00Z',
        })),
      })
    );
    expect(renderVisibilityAuditMarkdown(report)).toContain(
      `Share of citation: ${expected}.`
    );
  });

  it('builds the Tim /tim sample from verified profile evidence only', () => {
    const report = assembleVisibilityAudit(TIM_WHITE_VISIBILITY_AUDIT_INPUT);
    expect(report.profilePath).toBe('/tim');
    expect(report.priceUsd).toBe(ARTIST_VISIBILITY_OFFER.pro.monthlyUsd);
    expect(report.creditNote).toContain(`$${report.priceUsd}`);
    expect(report.identity.mbid).toBeNull();
    expect(report.identity.wikidataQid).toBeNull();
    expect(report.identity.isnis).toEqual([]);
    expect(report.identity.sameAs).toEqual([
      TIM_WHITE_VISIBILITY_AUDIT_INPUT.spotifyUrl,
    ]);
    expect(report.dspPresence.registryCount).toBe(DSP_REGISTRY.length);
    expect(report.dspPresence.platforms.map(row => row.key)).toEqual(
      DSP_REGISTRY.map(entry => entry.key)
    );
    expect(
      report.dspPresence.platforms.find(row => row.key === 'spotify')?.present
    ).toBe(true);
    expect(report.dspPresence.presentCount).toBe(1);
    expect(report.searchOwnership.mode).toBe('manual_check');
    expect(report.searchOwnership.serpApiRequests).toBe(0);
    expect(report.searchOwnership.monitoringDefault).toBe(
      APP_FLAG_DEFAULTS.PROFILE_SEARCH_MONITORING
    );
    expect(report.citations.questions.map(row => row.question)).toEqual(
      buildCanonicalQuestions(report.artistName).map(row => row.question)
    );
    expect(report.catalog.mismatches).toEqual([]);
    expect(report.pixels.rows.every(row => !row.present)).toBe(true);
    expect(report.fixes[0]?.agenticFix).toMatchObject({
      kind: 'submission',
      providerId: 'musicbrainz_authenticated_edit',
      ready: false,
    });
    expect(
      report.fixes.some(
        fix =>
          fix.agenticFix.kind === 'submission' &&
          fix.agenticFix.providerId === ALLMUSIC_SUBMISSION_PROVIDER_ID
      )
    ).toBe(true);
    expect(
      report.fixes.some(fix => fix.agenticFix.kind === 'dsp_bio_sync')
    ).toBe(true);
    expect(report.searchOwnership.instruction).toContain('SerpAPI');
    expect(report.catalog.policy).toContain('Spotify Developer Policy III.13');

    const markdown = renderVisibilityAuditMarkdown(report);
    expect(markdown).toContain('MusicFetch is not called');
    expect(markdown).toContain('SerpAPI requests: 0');
    expect(markdown).toContain('Spotify Developer Policy III.13');
    const committed = readFileSync(
      path.resolve(HERE, '../../../../docs/examples/visibility-audit/tim.md'),
      'utf8'
    );
    expect(committed).toBe(markdown);
  });

  it('resolves MBID to Wikidata QID to ISNI from stored identity links', () => {
    const report = assembleVisibilityAudit(
      withInput({
        musicbrainzId: '11111111-1111-4111-8111-111111111111',
        identityLinks: [
          {
            platform: 'wikidata',
            url: 'https://www.wikidata.org/wiki/Q42',
            externalId: 'Q42',
          },
          {
            platform: 'isni',
            url: 'https://isni.org/isni/0000000121032683',
            externalId: '0000000121032683',
          },
        ],
      })
    );
    expect(report.identity.steps.map(step => step.status)).toEqual([
      'present',
      'present',
      'present',
    ]);
    expect(report.identity.sameAs).toEqual(
      expect.arrayContaining([
        'https://musicbrainz.org/artist/11111111-1111-4111-8111-111111111111',
        'https://www.wikidata.org/wiki/Q42',
        'https://isni.org/isni/0000000121032683',
      ])
    );
    expect(
      report.fixes.some(fix =>
        fix.title.includes('Create or confirm the MusicBrainz')
      )
    ).toBe(false);
  });

  it('flags link-in-bio conflicts from ingestion strategy URLs', () => {
    const report = assembleVisibilityAudit(
      withInput({
        socialLinks: [
          { platform: 'instagram', url: 'https://instagram.com/tim' },
          { platform: 'linktree', url: 'https://linktr.ee/tim' },
        ],
        ingestedUrls: ['https://beacons.ai/tim'],
        linkInBioOutbound: [
          {
            sourceUrl: 'https://linktr.ee/tim',
            outboundUrls: ['https://instagram.com/other'],
          },
        ],
      })
    );
    expect(report.linkGraph.conflicts.map(conflict => conflict.kind)).toEqual(
      expect.arrayContaining([
        'multiple_link_in_bio_products',
        'handle_mismatch',
        'outbound_disagrees_with_profile',
      ])
    );
  });

  it('keeps catalog rows on ISRC presence and drops derived Spotify metrics', () => {
    const report = assembleVisibilityAudit(
      withInput({
        catalogMismatches: [
          {
            isrc: 'USAAA1234567',
            mismatchType: 'missing_from_dsp',
            status: 'flagged',
            externalTrackName: 'Night Drive',
            providerId: 'spotify',
            popularity: 87,
            followers: 1200,
          } as VisibilityAuditInput['catalogMismatches'][number],
        ],
      })
    );
    expect(report.catalog.mismatches).toEqual([
      {
        isrc: 'USAAA1234567',
        mismatchType: 'missing_from_dsp',
        status: 'flagged',
        externalTrackName: 'Night Drive',
        externalAlbumName: null,
        providerId: 'spotify',
      },
    ]);
    expect(JSON.stringify(report.catalog)).not.toContain('87');
    expect(JSON.stringify(report.catalog)).not.toContain('1200');
    expect(findDerivedSpotifyMetricKeys({ popularity: 1 })).toEqual([
      '$.popularity',
    ]);
  });

  it('splits shared YouTube hosts without calling a resolver', () => {
    expect(dspKeyForUrl('https://music.youtube.com/channel/abc')).toBe(
      'youtube_music'
    );
    expect(dspKeyForUrl('https://www.youtube.com/shorts/abc')).toBe(
      'youtube_shorts'
    );
    expect(dspKeyForUrl('https://www.youtube.com/@tim')).toBe('youtube');
  });

  it('does not import MusicFetch, SerpAPI, or live entity resolution', () => {
    const files = readdirSync(HERE).filter(
      name => name.endsWith('.ts') && !name.endsWith('.test.ts')
    );
    const source = files
      .map(name => readFileSync(path.join(HERE, name), 'utf8'))
      .join('\n');
    expect(source).not.toMatch(
      /dsp-enrichment\/musicfetch|musicfetch-enrichment|google-serpapi|getMusicBrainzArtist|resolveEntityIds/
    );
  });
});
