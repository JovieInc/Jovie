import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rejectCoreSocialHtmlFetch } from '@/lib/ingestion/social-html-policy';
import {
  fetchLayloProfile,
  INGESTION_PLATFORM_IDS,
} from '@/lib/ingestion/strategies';
import { getArtistProfileCatalog } from './artist-profile-catalog';
import {
  ARTIST_PROFILE_FIELDS,
  artistProfileContractSchema,
} from './artist-profile-contract';
import { ARTIST_PROFILE_DESTINATIONS } from './artist-profile-registry';
import { DSP_PROFILE_CATALOG } from './dsp-profile-catalog';
import { CONNECTOR_REGISTRY } from './registry';
import { SOCIAL_PROFILE_CATALOG } from './social-profile-catalog';

afterEach(() => vi.restoreAllMocks());

describe('shared artist-profile destination coverage', () => {
  it('requires a conforming manifest for every ingestion platform', () => {
    expect(Object.keys(SOCIAL_PROFILE_CATALOG)).toEqual(INGESTION_PLATFORM_IDS);
    for (const id of INGESTION_PLATFORM_IDS) {
      const destination = SOCIAL_PROFILE_CATALOG[id];
      expect(destination.id).toBe(id);
      expect(Object.keys(destination.artistProfile.fields)).toEqual(
        ARTIST_PROFILE_FIELDS
      );
      expect(() =>
        artistProfileContractSchema.parse(destination.artistProfile)
      ).not.toThrow();
      expect(ARTIST_PROFILE_DESTINATIONS[id].profile).toBe(
        destination.artistProfile
      );
    }
    expect(ARTIST_PROFILE_DESTINATIONS).not.toHaveProperty('unknown');
  });

  it('keeps one sorted definition per platform across social, DSP, and OAuth', () => {
    const ids = [
      ...new Set([
        ...Object.keys(DSP_PROFILE_CATALOG),
        ...INGESTION_PLATFORM_IDS,
      ]),
    ].sort();
    expect(Object.keys(ARTIST_PROFILE_DESTINATIONS)).toEqual(ids);
    for (const destination of Object.values(DSP_PROFILE_CATALOG)) {
      expect(ARTIST_PROFILE_DESTINATIONS[destination.id].profile).toBe(
        destination.artistProfile
      );
    }
    for (const id of INGESTION_PLATFORM_IDS) {
      if (id === 'youtube') continue;
      expect(ARTIST_PROFILE_DESTINATIONS[id].sources).toEqual(['ingestion']);
      expect(ARTIST_PROFILE_DESTINATIONS[id].rollout).toBe('planned');
    }
    expect(SOCIAL_PROFILE_CATALOG.youtube).toBe(DSP_PROFILE_CATALOG.youtube);
    expect(ARTIST_PROFILE_DESTINATIONS.youtube.sources).toEqual([
      'connector',
      'dsp_bio',
      'ingestion',
    ]);
    expect(CONNECTOR_REGISTRY.youtube.artistProfile).toBe(
      DSP_PROFILE_CATALOG.youtube.artistProfile
    );
    expect(CONNECTOR_REGISTRY.spotify.artistProfile).toBe(
      DSP_PROFILE_CATALOG.spotify.artistProfile
    );
    expect(ARTIST_PROFILE_DESTINATIONS).not.toHaveProperty('x');
    expect(ARTIST_PROFILE_DESTINATIONS).not.toHaveProperty('youtube_music');
  });

  it('records source evidence, validation constraints, and blocked policies for each new destination', () => {
    for (const id of INGESTION_PLATFORM_IDS) {
      if (id === 'youtube') continue;
      const destination = SOCIAL_PROFILE_CATALOG[id];
      expect(destination.availability).toBe('planned');
      expect(destination.evidence.reviewedOn).toBe('2026-10-16');
      expect(destination.evidence.refs).toContain(
        'docs/network-support-matrix.md'
      );
      expect(destination.evidence.refs).toContain(
        destination.validation.profileUrlRef
      );
      expect(destination.validation.constraints.length).toBeGreaterThan(0);
      for (const ref of destination.evidence.refs) {
        const evidencePath = resolve(process.cwd(), '../..', ref);
        expect(
          existsSync(evidencePath),
          `missing source evidence: ${evidencePath}`
        ).toBe(true);
      }
      expect(destination.authorization.read.mechanism).toBe('none');
      expect(destination.authorization.write.mechanism).toBe('unknown');
      expect(destination.quota.status).toBe('unknown');
      for (const field of Object.values(destination.artistProfile.fields)) {
        expect(field.read).toBe('unsupported');
        expect(field.authorization.read).toEqual({
          status: 'unsupported',
          reason: destination.ingestion.detail,
        });
        expect(field.write).toBe('unknown');
        expect(field.authorization.write.status).toBe('unknown');
        expect(field.validation.status).toBe('unknown');
        expect(field.rateLimit.status).toBe('unknown');
        expect(field.preview.status).toBe('unknown');
        expect(field.confirmation.status).toBe('unknown');
        expect(field.audit.mode).toBe('unknown');
        expect(field.rollback.mode).toBe('unknown');
        expect(field.termsApi.status).toBe('unknown');
        expect(field.evidence).toEqual({
          status: 'documented',
          requirements: ['documentation'],
          refs: destination.evidence.refs,
        });
      }
    }
  });

  it('projects social blocks without advertising reads or writes', () => {
    const catalog = getArtistProfileCatalog(new Date('2026-10-16T00:00:00Z'));
    const linktree = catalog.destinations.find(item => item.id === 'linktree');
    expect(linktree?.rollout).toBe('planned');
    expect(linktree?.label).toBe('Linktree');
    for (const field of linktree?.fields ?? []) {
      expect(field.read).toMatchObject({
        support: 'unsupported',
        available: false,
      });
      expect(field.write.available).toBe(false);
      expect(field.authorization.read).toMatchObject({
        status: 'unsupported',
        reason: SOCIAL_PROFILE_CATALOG.linktree.ingestion.detail,
      });
    }
  });

  it('aligns policy-blocked reads with the actual core HTML guard', () => {
    const urls = {
      beacons: ['https://beacons.ai/artist', 'https://beacons.page/artist'],
      instagram: ['https://www.instagram.com/artist'],
      linktree: ['https://linktr.ee/artist', 'https://linktree.com/artist'],
      tiktok: ['https://www.tiktok.com/@artist'],
      twitter: ['https://x.com/artist', 'https://twitter.com/artist'],
    } as const;
    for (const [id, profileUrls] of Object.entries(urls)) {
      const destination = SOCIAL_PROFILE_CATALOG[id as keyof typeof urls];
      expect(destination.ingestion.status).toBe('blocked_policy');
      for (const url of profileUrls) {
        expect(() => rejectCoreSocialHtmlFetch(url)).toThrow(
          expect.objectContaining({ code: 'SOCIAL_HTML_DISABLED' })
        );
      }
    }
    expect(() =>
      rejectCoreSocialHtmlFetch('https://www.youtube.com/@artist')
    ).toThrow(expect.objectContaining({ code: 'SOCIAL_HTML_DISABLED' }));
    expect(SOCIAL_PROFILE_CATALOG.youtube.blockedReason).toContain(
      'Core YouTube HTML ingestion is prohibited'
    );
    expect(SOCIAL_PROFILE_CATALOG.youtube.apiFields.bio.read).toBe(
      'documented'
    );
    expect(SOCIAL_PROFILE_CATALOG.youtube.artistProfile.fields.bio.read).toBe(
      'unknown'
    );
  });

  it('keeps Laylo blocked when its checked-in fetch rejects the source host', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    expect(SOCIAL_PROFILE_CATALOG.laylo.ingestion.status).toBe(
      'blocked_unreliable'
    );
    await expect(fetchLayloProfile('artist')).rejects.toMatchObject({
      code: 'INVALID_HOST',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
