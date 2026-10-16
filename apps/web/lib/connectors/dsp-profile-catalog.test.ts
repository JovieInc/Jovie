import { describe, expect, it } from 'vitest';
import {
  DSP_BIO_PROVIDERS,
  getApiBioProviders,
  getEmailBioProviders,
  isBioSyncSupported,
} from '@/lib/dsp-bio-sync/providers';
import { ARTIST_PROFILE_FIELDS } from './artist-profile-contract';
import { getAdvertisedConnectorIntegrations } from './capabilities';
import {
  DSP_PROFILE_CATALOG,
  DSP_PROFILE_DESTINATION_IDS,
  definePlannedDspProfileDestination,
  dspProfileEvidenceSchema,
} from './dsp-profile-catalog';
import { CONNECTOR_REGISTRY, getConnectorDefinitions } from './registry';
import { CONNECTOR_PROVIDER_IDS } from './types';

describe('DSP profile destination admission', () => {
  it('registers every existing DSP with closed fields and dated source evidence', () => {
    expect(Object.keys(DSP_PROFILE_CATALOG)).toEqual([
      'amazon_music',
      'apple_music',
      'deezer',
      'soundcloud',
      'spotify',
      'tidal',
      'youtube',
    ]);
    expect(Object.keys(DSP_PROFILE_CATALOG)).toEqual(
      DSP_PROFILE_DESTINATION_IDS
    );
    for (const destination of Object.values(DSP_PROFILE_CATALOG)) {
      expect(Object.keys(destination.apiFields)).toEqual(ARTIST_PROFILE_FIELDS);
      expect(Object.keys(destination.artistProfile.fields)).toEqual(
        ARTIST_PROFILE_FIELDS
      );
      expect(destination.evidence.reviewedOn).toBe('2026-10-16');
      expect(['documented', 'unknown']).toContain(destination.quota.status);
      expect(destination.termsApi.status).not.toBe('approved');
      for (const mode of ['read', 'write'] as const) {
        expect(destination.authorization[mode].evidenceUrl).toMatch(/^https:/);
        expect(destination.authorization[mode].detail.length).toBeGreaterThan(
          0
        );
      }
    }
  });

  it('never promotes documentation, partner access, or unknown quotas to write readiness', () => {
    for (const destination of Object.values(DSP_PROFILE_CATALOG)) {
      expect(destination.availability).toBe('planned');
      for (const field of Object.values(destination.artistProfile.fields)) {
        expect(field.write).not.toBe('supported');
        expect(field.authorization.write.status).not.toBe('verified');
        expect(field.rollback.mode).toBe('unknown');
      }
    }
    expect(DSP_PROFILE_CATALOG.youtube.apiFields.bio.write).toBe('documented');
    expect(DSP_PROFILE_CATALOG.apple_music.apiFields.image.write).toBe(
      'partner_only'
    );
    expect(DSP_PROFILE_CATALOG.deezer.termsApi.status).toBe('unknown');
    expect(DSP_PROFILE_CATALOG.spotify.quota.status).toBe('unknown');
    expect(DSP_PROFILE_CATALOG.soundcloud.artistProfile.fields.bio.write).toBe(
      'unsupported'
    );
  });

  it('rejects incomplete evidence and attempts to mark research destinations available', () => {
    const { artistProfile: _, ...evidence } = DSP_PROFILE_CATALOG.youtube;
    for (const invalid of [
      { ...evidence, availability: 'available' },
      { ...evidence, evidence: { reviewedOn: 'unknown', urls: [] } },
      { ...evidence, termsApi: { ...evidence.termsApi, termsUrl: '' } },
      { ...evidence, apiFields: { bio: evidence.apiFields.bio } },
      {
        ...evidence,
        authorization: {
          ...evidence.authorization,
          write: { ...evidence.authorization.write, scopes: ['youtube.*'] },
        },
      },
    ]) {
      expect(dspProfileEvidenceSchema.safeParse(invalid).success).toBe(false);
      expect(() =>
        definePlannedDspProfileDestination(invalid as typeof evidence)
      ).toThrow();
    }
  });

  it('shares connector manifests without adding planned accounts or advertised integrations', () => {
    expect(CONNECTOR_PROVIDER_IDS).toEqual([
      'gmail',
      'google_calendar',
      'spotify',
      'youtube',
    ]);
    for (const id of ['spotify', 'youtube'] as const) {
      expect(CONNECTOR_REGISTRY[id].artistProfile).toBe(
        DSP_PROFILE_CATALOG[id].artistProfile
      );
    }
    const advertised = getAdvertisedConnectorIntegrations({
      gmail: { available: true },
      google_calendar: { available: true },
      spotify: { available: true },
      youtube: { available: true },
    });
    expect(advertised.map(provider => provider.id)).toEqual(
      getConnectorDefinitions().map(provider => provider.id)
    );
    expect(
      advertised.flatMap(provider => provider.capabilities.map(item => item.id))
    ).not.toEqual(expect.arrayContaining([expect.stringMatching(/profile/)]));
  });

  it('derives every legacy bio provider from the catalog and disables unverified emails', () => {
    expect(Object.keys(DSP_BIO_PROVIDERS)).toEqual(
      Object.values(DSP_PROFILE_CATALOG).map(item => item.legacyBioProviderId)
    );
    for (const destination of Object.values(DSP_PROFILE_CATALOG)) {
      const legacy = DSP_BIO_PROVIDERS[destination.legacyBioProviderId];
      expect(legacy.displayName).toBe(destination.label);
      expect(legacy.method).toBe(destination.transport.legacyBio);
      expect(legacy.artistPortalUrl).toBe(destination.artistPortalUrl);
      expect(legacy.enabled).toBe(false);
      expect(legacy.supportEmail).toBeUndefined();
      expect(legacy.rollback).toBe('unsupported');
      expect(isBioSyncSupported(destination.legacyBioProviderId)).toBe(false);
    }
    expect(isBioSyncSupported('not-a-dsp')).toBe(false);
    expect(getApiBioProviders()).toEqual([]);
    expect(getEmailBioProviders()).toEqual([]);
  });
});
