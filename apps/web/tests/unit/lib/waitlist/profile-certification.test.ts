import { describe, expect, it } from 'vitest';
import {
  applyProfileCertReceipt,
  emptyProfileCertLedger,
  evaluateProfileCertification,
  isProfileCertifiedForInvite,
  PROFILE_CERT_RECEIPT_SCHEMA,
  type ProfileCertFacts,
  type ProfileCertReceipt,
  parseProfileCertLedger,
} from '@/lib/waitlist/profile-certification';

function facts(overrides: Partial<ProfileCertFacts> = {}): ProfileCertFacts {
  return {
    profileId: 'profile-1',
    waitlistEntryId: 'entry-1',
    displayName: 'Ana Lund',
    username: 'analund',
    avatarUrl: 'https://i.scdn.co/image/abc',
    spotifyId: 'sp1',
    selectedSpotifyArtistId: 'sp1',
    selectedSpotifyArtistName: 'Ana Lund',
    personName: 'Ana Lund',
    isPublic: false,
    releases: [
      {
        title: 'Spring',
        slug: 'spring',
        hasArtwork: true,
        smartLinkTargets: 3,
      },
    ],
    entitlement: {
      plan: 'free',
      isPro: false,
      hasStripeSubscription: false,
      trialEndsAt: null,
    },
    publicPage: null,
    smartLinkProbes: [],
    ...overrides,
  };
}

function statusOf(f: ProfileCertFacts, id: string) {
  return evaluateProfileCertification(f).checks.find(c => c.id === id)?.status;
}

describe('evaluateProfileCertification', () => {
  it('passes a profile with the chosen artist, releases and links', () => {
    const result = evaluateProfileCertification(facts());
    expect(result.status).toBe('passed');
    expect(result.remediation).toEqual([]);
    // A private page is not probed yet; that is skipped, not failed.
    expect(statusOf(facts(), 'public_page')).toBe('skipped');
  });

  it('fails an empty catalog and dispatches the catalog import', () => {
    const result = evaluateProfileCertification(facts({ releases: [] }));
    expect(result.status).toBe('failed');
    expect(result.remediation).toEqual(['import_catalog']);
    expect(statusOf(facts({ releases: [] }), 'releases_present')).toBe(
      'failed'
    );
    expect(statusOf(facts({ releases: [] }), 'smart_links')).toBe('failed');
  });

  it('never certifies an artist the person did not pick', () => {
    const wrong = facts({ selectedSpotifyArtistId: 'other' });
    const result = evaluateProfileCertification(wrong);
    expect(result.status).toBe('needs_artist_confirmation');
    expect(result.remediation).toEqual(['ask_artist_confirmation']);
    expect(isProfileCertifiedForInvite(result)).toBe(false);
  });

  it('asks for confirmation when nobody picked the artist and names differ', () => {
    const unconfirmed = facts({
      selectedSpotifyArtistId: null,
      personName: 'Someone Else',
    });
    expect(evaluateProfileCertification(unconfirmed).status).toBe(
      'needs_artist_confirmation'
    );
  });

  it('accepts an unpicked match whose name equals the person, ignoring accents', () => {
    const named = facts({
      selectedSpotifyArtistId: null,
      displayName: 'Ána Lund',
      personName: 'ana lund',
    });
    expect(statusOf(named, 'artist_match')).toBe('passed');
  });

  it('needs an artist when no artist is matched at all', () => {
    expect(
      evaluateProfileCertification(facts({ spotifyId: null })).status
    ).toBe('needs_artist_confirmation');
  });

  it('fails placeholder data and routes it to an operator', () => {
    const demo = facts({ displayName: 'Demo', personName: 'Demo' });
    const result = evaluateProfileCertification(demo);
    expect(result.status).toBe('failed');
    expect(statusOf(demo, 'no_placeholder_data')).toBe('failed');
    expect(result.remediation).toContain('operator_card');
  });

  it('fails a broken public page and broken smart link pages', () => {
    const broken = facts({
      isPublic: true,
      publicPage: { status: 500, errorMarkers: [] },
      smartLinkProbes: [{ status: 404 }],
    });
    expect(statusOf(broken, 'public_page')).toBe('failed');
    expect(statusOf(broken, 'smart_links')).toBe('failed');
  });

  it('fails a paid flag with no subscription or trial', () => {
    const paid = facts({
      entitlement: {
        plan: 'pro',
        isPro: true,
        hasStripeSubscription: false,
        trialEndsAt: null,
      },
    });
    expect(statusOf(paid, 'entitlement_sane')).toBe('failed');
  });
});

describe('profile certification ledger', () => {
  function receipt(
    status: ProfileCertReceipt['status'],
    endedAt: string
  ): ProfileCertReceipt {
    return {
      schema: PROFILE_CERT_RECEIPT_SCHEMA,
      profileId: 'profile-1',
      waitlistEntryId: 'entry-1',
      status,
      sha: 'a'.repeat(40),
      trigger: 'catalog_import',
      startedAt: endedAt,
      endedAt,
      checks: [
        {
          id: 'releases_present',
          status: status === 'passed' ? 'passed' : 'failed',
          summary: 'x',
        },
      ],
      remediation: [],
      evidence: null,
    };
  }

  it('keeps the newest verdict and the first pass time', () => {
    const empty = emptyProfileCertLedger('2026-10-29T00:00:00.000Z');
    const failed = applyProfileCertReceipt(
      empty,
      receipt('failed', '2026-10-29T01:00:00.000Z'),
      '2026-10-29T01:00:00.000Z'
    ).ledger;
    const passed = applyProfileCertReceipt(
      failed,
      receipt('passed', '2026-10-29T02:00:00.000Z'),
      '2026-10-29T02:00:00.000Z'
    ).ledger;
    const stale = applyProfileCertReceipt(
      passed,
      receipt('failed', '2026-10-29T01:30:00.000Z'),
      '2026-10-29T03:00:00.000Z'
    );

    expect(stale.recorded).toBe(false);
    const record = parseProfileCertLedger(JSON.stringify(stale.ledger))
      .profiles['profile-1'];
    expect(record?.latest.status).toBe('passed');
    expect(record?.firstPassedAt).toBe('2026-10-29T02:00:00.000Z');
    expect(record?.history.map(h => h.status)).toEqual(['failed', 'passed']);
  });

  it('rejects a passed receipt that hides a failed check', () => {
    const ledger = applyProfileCertReceipt(
      emptyProfileCertLedger('2026-10-29T00:00:00.000Z'),
      {
        ...receipt('passed', '2026-10-29T01:00:00.000Z'),
        checks: [{ id: 'releases_present', status: 'failed', summary: 'x' }],
      },
      '2026-10-29T01:00:00.000Z'
    ).ledger;
    expect(() => parseProfileCertLedger(ledger)).toThrow();
  });
});
