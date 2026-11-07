import { describe, expect, it } from 'vitest';
import {
  type CanaryResetProfileRow,
  isClaimWalkCanaryEmail,
  planCanaryReset,
  summarizeCanaryResetPlan,
} from './canary-reset-plan';
import { PRODCERT_CLAIM_CANARY_EMAIL } from './prodcert-identities';

const CANARY_ID = '11111111-1111-4111-8111-111111111111';

function profileRow(
  overrides: Partial<CanaryResetProfileRow> = {}
): CanaryResetProfileRow {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    userId: CANARY_ID,
    usernameNormalized: 'jovie-prodcert-claim',
    isClaimed: true,
    isPublic: true,
    claimedAt: new Date('2026-11-05T00:00:00Z'),
    claimToken: 'token',
    claimTokenExpiresAt: new Date('2026-11-05T01:00:00Z'),
    onboardingCompletedAt: new Date('2026-11-05T00:30:00Z'),
    settings: null,
    ...overrides,
  };
}

describe('isClaimWalkCanaryEmail', () => {
  it('accepts only the exact fixed claim-walk canary address', () => {
    expect(isClaimWalkCanaryEmail(PRODCERT_CLAIM_CANARY_EMAIL)).toBe(true);
    expect(
      isClaimWalkCanaryEmail('  Browse-Ready+Synthetic-Prodcert-Claim@jov.ie ')
    ).toBe(true);
  });

  it('refuses every other address shape', () => {
    expect(isClaimWalkCanaryEmail(null)).toBe(false);
    expect(isClaimWalkCanaryEmail('')).toBe(false);
    // A per-run prodcert address is NOT the fixed claim canary.
    expect(
      isClaimWalkCanaryEmail('browse-ready+synthetic-prodcert-abc123@jov.ie')
    ).toBe(false);
    expect(isClaimWalkCanaryEmail('tim@jov.ie')).toBe(false);
    // Sub-addressing the canary name is still a different account.
    expect(
      isClaimWalkCanaryEmail('browse-ready+synthetic-prodcert-claim+1@jov.ie')
    ).toBe(false);
  });
});

describe('planCanaryReset', () => {
  it('refuses any account that is not the fixed claim-walk canary', () => {
    expect(() =>
      planCanaryReset({
        user: { id: CANARY_ID, email: 'browse-ready+clerk_test@jov.ie' },
        claimRows: [],
        profileRows: [],
      })
    ).toThrow(/CANARY_RESET_REFUSED/);
    expect(() =>
      planCanaryReset({
        user: { id: CANARY_ID, email: null },
        claimRows: [],
        profileRows: [],
      })
    ).toThrow(/CANARY_RESET_REFUSED/);
  });

  it('soft-unclaims the reserved handle and clears onboarding completion', () => {
    const plan = planCanaryReset({
      user: { id: CANARY_ID, email: PRODCERT_CLAIM_CANARY_EMAIL },
      claimRows: [{ id: 'claim-1', userId: CANARY_ID }],
      profileRows: [profileRow()],
    });
    expect(plan.claimRowIds).toEqual(['claim-1']);
    expect(plan.profileUpdates).toHaveLength(1);
    const set = plan.profileUpdates[0]!.set;
    expect(set.userId).toBeNull();
    expect(set.isClaimed).toBe(false);
    expect(set.isPublic).toBe(false);
    expect(set.claimedAt).toBeNull();
    expect(set.claimToken).toBeNull();
    expect(set.claimTokenExpiresAt).toBeNull();
    expect(set.onboardingCompletedAt).toBeNull();
    expect(plan.deleteChatConversations).toBe(true);
    expect(plan.deleteSuggestedActions).toBe(true);
  });

  it('flips a claimed structured-credit marker back to unclaimed', () => {
    const claimedSettings = {
      unclaimedArtistProfile: {
        source: 'structured_spotify_release_credit',
        provider: 'spotify',
        state: 'claimed',
        artistRegistryId: 'reg-1',
        providerArtistId: 'spot-1',
        ownershipVerified: true,
        representationVerified: true,
        consentObtained: true,
        claimedAt: '2026-11-05T00:00:00.000Z',
      },
    };
    const plan = planCanaryReset({
      user: { id: CANARY_ID, email: PRODCERT_CLAIM_CANARY_EMAIL },
      claimRows: [],
      profileRows: [profileRow({ settings: claimedSettings })],
    });
    const settings = plan.profileUpdates[0]!.set.settings as Record<
      string,
      unknown
    >;
    const marker = settings.unclaimedArtistProfile as Record<string, unknown>;
    expect(marker.state).toBe('unclaimed');
    expect(marker.ownershipVerified).toBe(true);
    expect('claimedAt' in marker).toBe(false);
  });

  it('plans nothing when the canary is already in its pre-claim state', () => {
    const plan = planCanaryReset({
      user: { id: CANARY_ID, email: PRODCERT_CLAIM_CANARY_EMAIL },
      claimRows: [],
      profileRows: [
        profileRow({
          isClaimed: false,
          isPublic: false,
          claimedAt: null,
          claimToken: null,
          claimTokenExpiresAt: null,
          onboardingCompletedAt: null,
        }),
      ],
    });
    expect(plan.claimRowIds).toEqual([]);
    expect(plan.profileUpdates).toEqual([]);
  });

  it('never plans writes for profiles owned by another user', () => {
    const plan = planCanaryReset({
      user: { id: CANARY_ID, email: PRODCERT_CLAIM_CANARY_EMAIL },
      claimRows: [
        { id: 'claim-other', userId: '99999999-9999-4999-8999-999999999999' },
      ],
      profileRows: [
        profileRow({ userId: '99999999-9999-4999-8999-999999999999' }),
      ],
    });
    expect(plan.claimRowIds).toEqual([]);
    expect(plan.profileUpdates).toEqual([]);
  });
});

describe('summarizeCanaryResetPlan', () => {
  it('reports counts and handles, never emails or tokens', () => {
    const plan = planCanaryReset({
      user: { id: CANARY_ID, email: PRODCERT_CLAIM_CANARY_EMAIL },
      claimRows: [{ id: 'claim-1', userId: CANARY_ID }],
      profileRows: [profileRow()],
    });
    const summary = summarizeCanaryResetPlan(plan);
    expect(summary).toContain('claims=1');
    expect(summary).toContain('profiles=1');
    expect(summary).toContain('handles=jovie-prodcert-claim');
    expect(summary).not.toContain(PRODCERT_CLAIM_CANARY_EMAIL);
    expect(summary).not.toContain('token');
  });
});
