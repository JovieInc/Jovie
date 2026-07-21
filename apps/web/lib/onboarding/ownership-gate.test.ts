import { describe, expect, it } from 'vitest';
import {
  assertAuthenticatedOnboardingUser,
  assertConversationOwnedByUser,
  assertOnboardingProfileOwner,
  describeArtistProfileForVisitor,
  isOnboardingOwnershipError,
  OnboardingOwnershipError,
  requireVerifiedOwnerForReservation,
} from '@/lib/onboarding/ownership-gate';

describe('onboarding ownership gate', () => {
  describe('assertAuthenticatedOnboardingUser', () => {
    it('throws UNAUTHORIZED for null, empty, or missing userId', () => {
      for (const userId of [null, undefined, '', '   ']) {
        try {
          assertAuthenticatedOnboardingUser(userId);
          expect.fail('expected throw');
        } catch (error) {
          expect(isOnboardingOwnershipError(error)).toBe(true);
          expect((error as OnboardingOwnershipError).status).toBe(401);
          expect((error as OnboardingOwnershipError).errorCode).toBe(
            'UNAUTHORIZED'
          );
        }
      }
    });

    it('accepts a non-empty authenticated userId', () => {
      expect(() =>
        assertAuthenticatedOnboardingUser('user_verified_1')
      ).not.toThrow();
    });
  });

  describe('assertOnboardingProfileOwner', () => {
    it('blocks non-owners from manage-as-owner outcomes', () => {
      try {
        assertOnboardingProfileOwner({
          authenticatedUserId: 'user_a',
          profileOwnerUserId: 'user_b',
        });
        expect.fail('expected throw');
      } catch (error) {
        expect(isOnboardingOwnershipError(error)).toBe(true);
        expect((error as OnboardingOwnershipError).status).toBe(403);
        expect((error as OnboardingOwnershipError).errorCode).toBe('FORBIDDEN');
      }
    });

    it('blocks unowned profiles (null owner) fail closed', () => {
      expect(() =>
        assertOnboardingProfileOwner({
          authenticatedUserId: 'user_a',
          profileOwnerUserId: null,
        })
      ).toThrow(OnboardingOwnershipError);
    });

    it('allows the verified owner', () => {
      expect(() =>
        assertOnboardingProfileOwner({
          authenticatedUserId: 'user_a',
          profileOwnerUserId: 'user_a',
        })
      ).not.toThrow();
    });
  });

  describe('assertConversationOwnedByUser', () => {
    it('returns NOT_FOUND when conversation is missing', () => {
      try {
        assertConversationOwnedByUser({
          authenticatedUserId: 'user_a',
          conversationUserId: null,
          conversationExists: false,
        });
        expect.fail('expected throw');
      } catch (error) {
        expect((error as OnboardingOwnershipError).status).toBe(404);
        expect((error as OnboardingOwnershipError).errorCode).toBe('NOT_FOUND');
      }
    });

    it('returns FORBIDDEN when conversation belongs to another user', () => {
      try {
        assertConversationOwnedByUser({
          authenticatedUserId: 'user_a',
          conversationUserId: 'user_b',
          conversationExists: true,
        });
        expect.fail('expected throw');
      } catch (error) {
        expect((error as OnboardingOwnershipError).status).toBe(403);
      }
    });

    it('allows when conversation is attached to the authenticated user', () => {
      expect(() =>
        assertConversationOwnedByUser({
          authenticatedUserId: 'user_a',
          conversationUserId: 'user_a',
          conversationExists: true,
        })
      ).not.toThrow();
    });
  });

  describe('requireVerifiedOwnerForReservation', () => {
    it('refuses anonymous reservation success', () => {
      expect(() =>
        requireVerifiedOwnerForReservation({ userId: null })
      ).toThrow(/Sign in is required/);
    });

    it('returns verified userId for owner path', () => {
      expect(
        requireVerifiedOwnerForReservation({
          userId: 'user_owner',
          conversationExists: true,
          conversationUserId: 'user_owner',
        })
      ).toEqual({ userId: 'user_owner' });
    });
  });

  describe('describeArtistProfileForVisitor', () => {
    it('uses neutral phrasing before ownership is verified', () => {
      expect(
        describeArtistProfileForVisitor({
          ownershipVerified: false,
          artistName: 'Luna Waves',
        })
      ).toBe('this artist profile (Luna Waves)');

      expect(
        describeArtistProfileForVisitor({
          ownershipVerified: false,
          artistName: null,
        })
      ).toBe('this artist profile');
    });

    it('names the artist only after ownership is verified', () => {
      expect(
        describeArtistProfileForVisitor({
          ownershipVerified: true,
          artistName: 'Luna Waves',
        })
      ).toBe("Luna Waves's profile");
    });
  });
});
