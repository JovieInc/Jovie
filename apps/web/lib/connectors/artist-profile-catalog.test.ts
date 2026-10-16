import { describe, expect, it } from 'vitest';
import {
  getBioProvider,
  getEnabledBioProviders,
} from '@/lib/dsp-bio-sync/providers';
import {
  getArtistProfileCatalog,
  projectArtistProfileDestination,
} from './artist-profile-catalog';
import { unknownArtistProfileContract } from './artist-profile-contract';
import type { ArtistProfileDestinationManifest } from './artist-profile-registry';
import {
  buildProfileWriteManifest,
  getProfileWriteManifest,
} from './profile-writes/manifest';

const now = new Date('2026-10-16T00:00:00Z');
function ready(): ArtistProfileDestinationManifest {
  const profile = unknownArtistProfileContract('fixture');
  const authorization = {
    status: 'verified',
    mechanism: 'oauth',
    requiredScopes: ['profile.write'],
    resource: 'connected artist',
    requiredRole: 'owner',
    evidenceRef: 'fixture:owner',
  } as const;
  const required = {
    status: 'required',
    binding: 'destination_field_value',
    policyRef: 'fixture:exact-value',
  } as const;
  for (const name of Object.keys(
    profile.fields
  ) as (keyof typeof profile.fields)[]) {
    profile.fields[name] = {
      read: 'supported',
      write: 'supported',
      authorization: { read: authorization, write: authorization },
      validation: { status: 'documented', policyRef: 'fixture:validation' },
      preview: required,
      confirmation: required,
      rateLimit: {
        status: 'documented',
        policyRef: 'fixture:quota',
        key: 'connection',
        maxRequests: 1,
        windowSeconds: 60,
        onLimit: 'respect_retry_after',
      },
      audit: { mode: 'before_after', policyRef: 'fixture:audit' },
      rollback: {
        mode: 'snapshot_restore',
        policyRef: 'fixture:restore',
        evidenceRef: 'fixture:restore-proof',
      },
      termsApi: {
        status: 'approved',
        api: 'official',
        apiRef: 'fixture:api',
        termsRef: 'fixture:terms',
        evidenceRef: 'fixture:terms-proof',
      },
      evidence: {
        status: 'documented',
        requirements: [
          'authorization',
          'before_after',
          'confirmation',
          'documentation',
          'preview',
          'readback',
          'rollback',
          'validation',
        ],
        refs: ['fixture:proof'],
        verifiedAt: '2026-10-15T00:00:00Z',
        expiresAt: '2099-01-01T00:00:00Z',
      },
    };
  }
  return {
    label: 'Fixture',
    sources: ['connector'],
    rollout: 'available',
    profile,
    constraints: { bio: { maxLength: 1500 } },
    recovery: 'unsupported',
  };
}

describe('credential-free artist-profile catalog', () => {
  it('represents every destination and field, preserving policies and blocking unverified writes', () => {
    const catalog = getArtistProfileCatalog(now);
    expect(catalog.destinations).toHaveLength(13);
    const youtube = catalog.destinations.find(item => item.id === 'youtube');
    expect(youtube?.aliases).toEqual(['youtube_music']);
    expect(youtube?.fields[0].documentation?.field.write).toBe('documented');
    expect(youtube?.fields[0].write.available).toBe(false);
    for (const destination of catalog.destinations) {
      expect(destination.fields.map(field => field.name)).toEqual([
        'bio',
        'bio_link',
        'image',
        'website',
      ]);
      for (const field of destination.fields) {
        expect(field.write.available).toBe(false);
        expect(field.write.blockingReason).toBeTruthy();
        for (const key of [
          'authorization',
          'constraints',
          'preview',
          'confirmation',
          'rateLimit',
          'rollback',
          'evidence',
        ])
          expect(field).toHaveProperty(key);
      }
    }
    expect(JSON.stringify(catalog)).not.toMatch(
      /supportEmail|tokenHandler|providerAccountId|accessToken|refreshToken/
    );
    expect(getEnabledBioProviders()).toEqual([]);
    expect(getBioProvider('spotify')).toMatchObject({
      enabled: false,
      rollback: 'unsupported',
    });
    expect(getBioProvider('absent')).toBeUndefined();
  });

  it('exposes fresh validated policies and derives adapter metadata from the same manifest', () => {
    const manifest = ready();
    const field = projectArtistProfileDestination('fixture', manifest, now)
      .fields[0];
    expect(field.write).toEqual({
      support: 'supported',
      available: true,
      blockingReason: null,
    });
    expect(field.authorization.write.label).toContain('owner');
    expect(field.constraints.maxLength).toBe(1500);
    expect(buildProfileWriteManifest('fixture', manifest)).toMatchObject({
      fields: ['bio', 'bioLink', 'image', 'website'],
      requiredScopes: ['profile.write'],
      rollback: 'conditional-restore',
      rateLimitWindowSeconds: 60,
    });
    expect(() => getProfileWriteManifest('absent')).toThrow(
      'unregistered-profile-destination'
    );
    expect(() => getProfileWriteManifest('spotify')).toThrow(
      'unverified-profile-destination'
    );
  });

  it.each(['blocked', 'planned'] as const)(
    'does not advertise %s operations even with fresh evidence',
    rollout => {
      const field = projectArtistProfileDestination(
        'fixture',
        { ...ready(), rollout },
        now
      ).fields[0];
      expect(field.read.available).toBe(false);
      expect(field.write.available).toBe(false);
      expect(field.write.blockingReason).toContain(rollout);
    }
  );

  it.each([
    [undefined, undefined, 'undated'],
    ['2026-10-14T00:00:00Z', '2026-10-16T00:00:00Z', 'stale'],
    ['2026-10-17T00:00:00Z', '2026-10-18T00:00:00Z', 'invalid'],
    ['2026-10-15T00:00:00Z', '2026-10-14T00:00:00Z', 'invalid'],
  ])(
    'blocks undated, expired and invalid evidence (%s, %s)',
    (verifiedAt, expiresAt, expected) => {
      const manifest = ready();
      const evidence = manifest.profile.fields.bio.evidence;
      if (evidence.status !== 'documented') throw new Error('fixture');
      Object.assign(evidence, { verifiedAt, expiresAt });
      const field = projectArtistProfileDestination('fixture', manifest, now)
        .fields[0];
      expect(field.evidence.freshness).toBe(expected);
      expect(field.read.available).toBe(false);
      expect(field.write).toMatchObject({
        available: false,
        blockingReason: `Operation evidence is ${expected}.`,
      });
    }
  );

  it('requires a proven rollback and rejects invalid manifests', () => {
    const manifest = ready();
    manifest.profile.fields.bio.rollback = {
      mode: 'unsupported',
      reason: 'manual only',
    };
    const field = projectArtistProfileDestination('fixture', manifest, now)
      .fields[0];
    expect(field.write.available).toBe(false);
    expect(field.read.available).toBe(true);
    manifest.profile.fields.bio.preview = {
      status: 'unknown',
      reason: 'missing preview',
    };
    expect(() =>
      projectArtistProfileDestination('fixture', manifest, now)
    ).toThrow();
  });

  it('does not advertise policies the current write ledger cannot enforce', () => {
    const manifest = ready();
    const bio = manifest.profile.fields.bio;
    if (
      bio.rollback.mode !== 'snapshot_restore' ||
      bio.rateLimit.status !== 'documented'
    )
      throw new Error('fixture');
    bio.rollback = { ...bio.rollback, mode: 'compensating_write' };
    expect(
      projectArtistProfileDestination('fixture', manifest, now).fields[0].write
        .available
    ).toBe(false);
    bio.rollback = { ...bio.rollback, mode: 'snapshot_restore' };
    bio.rateLimit = { ...bio.rateLimit, key: 'provider' };
    expect(
      projectArtistProfileDestination('fixture', manifest, now).fields[0].write
        .available
    ).toBe(false);
    expect(buildProfileWriteManifest('fixture', manifest).fields).not.toContain(
      'bio'
    );
  });
});
