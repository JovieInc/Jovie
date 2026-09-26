/**
 * Intent Router Tests (JOV-943)
 * Deterministic testing architecture: CRUD vs AI intent routing.
 *
 * These tests verify that the intent router correctly distinguishes between
 * operations that can be handled deterministically (CRUD) and those that
 * require AI processing. They also assert that the LLM is not invoked for
 * CRUD-classified operations.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  classifyIntent,
  isDeterministicIntent,
  routeIntent,
} from '@/lib/intent-detection';
import { IntentCategory } from '@/lib/intent-detection/types';

// ---------------------------------------------------------------------------
// Mock the profile mutation — the LLM is never involved in CRUD operations.
// These stubs stand in for direct DB writes.
// ---------------------------------------------------------------------------
vi.mock('@/lib/services/profile/mutations', () => ({
  updateProfileByClerkId: vi.fn().mockResolvedValue({
    id: 'profile_test_001',
    displayName: 'Updated Name',
    bio: 'Updated bio',
  }),
}));

// ---------------------------------------------------------------------------
// CRUD intent classification
// ---------------------------------------------------------------------------

describe('Intent router: CRUD vs AI routing', () => {
  describe('CRUD intents (deterministic — no AI needed)', () => {
    const crudMessages: Array<[string, IntentCategory]> = [
      ['change my name to DJ Shadow', IntentCategory.PROFILE_UPDATE_NAME],
      ['update display name to Aurora', IntentCategory.PROFILE_UPDATE_NAME],
      ['set name to The Weeknd', IntentCategory.PROFILE_UPDATE_NAME],
      ['rename artist name to MC Flow', IntentCategory.PROFILE_UPDATE_NAME],
      [
        'change bio to Independent R&B artist',
        IntentCategory.PROFILE_UPDATE_BIO,
      ],
      [
        'update my bio to Electronic music producer',
        IntentCategory.PROFILE_UPDATE_BIO,
      ],
      [
        'set bio to Portland-based ambient artist',
        IntentCategory.PROFILE_UPDATE_BIO,
      ],
      ['add instagram', IntentCategory.LINK_ADD],
      ['connect spotify', IntentCategory.LINK_ADD],
      ['add link to https://instagram.com/artist', IntentCategory.LINK_ADD],
      ['remove instagram', IntentCategory.LINK_REMOVE],
      ['delete twitter link', IntentCategory.LINK_REMOVE],
      ['disconnect spotify', IntentCategory.LINK_REMOVE],
      ['upload my photo', IntentCategory.AVATAR_UPLOAD],
      ['change my avatar', IntentCategory.AVATAR_UPLOAD],
      ['update profile picture', IntentCategory.AVATAR_UPLOAD],
      ['enable dark mode', IntentCategory.SETTINGS_TOGGLE],
      ['disable notifications', IntentCategory.SETTINGS_TOGGLE],
    ];

    it.each(
      crudMessages
    )('classifies "%s" as CRUD category %s', (message, expectedCategory) => {
      const intent = classifyIntent(message);
      expect(intent).not.toBeNull();
      expect(intent!.category).toBe(expectedCategory);
      expect(isDeterministicIntent(intent)).toBe(true);
    });

    it('CRUD intents always have confidence 1.0 (deterministic, not probabilistic)', () => {
      const intent = classifyIntent('change name to Test Artist');
      expect(intent).not.toBeNull();
      expect(intent!.confidence).toBe(1.0);
    });
  });

  describe('AI-required intents (non-deterministic)', () => {
    const aiMessages = [
      'help me grow my audience',
      'what should I post this week?',
      'write me a press release',
      'analyze my streaming performance',
      'how many followers do I have?',
      'generate a canvas for my single',
      'what are some good playlist strategies?',
      'can you help me with my profile',
      '',
    ];

    it.each(aiMessages)('does NOT classify "%s" as a CRUD intent', message => {
      const intent = classifyIntent(message);
      expect(isDeterministicIntent(intent)).toBe(false);
    });

    it('returns null for messages exceeding the classification length limit', () => {
      const longMessage = 'change name to ' + 'x'.repeat(300);
      expect(classifyIntent(longMessage)).toBeNull();
    });
  });

  describe('CRUD handler execution (no AI involved)', () => {
    const mockContext = {
      clerkUserId: 'user_clerk_123',
      profileId: 'profile_xyz',
    };

    it('routes PROFILE_UPDATE_NAME to handler and returns success', async () => {
      const intent = classifyIntent('change my name to New Artist Name');
      expect(intent).not.toBeNull();

      const result = await routeIntent(intent!, mockContext);
      expect(result).not.toBeNull();
      expect(result!.success).toBe(true);
      expect(result!.message).toContain('New Artist Name');
    });

    it('routes PROFILE_UPDATE_BIO to handler and returns success', async () => {
      const intent = classifyIntent('change bio to Indie artist from Austin');
      expect(intent).not.toBeNull();

      const result = await routeIntent(intent!, mockContext);
      expect(result).not.toBeNull();
      expect(result!.success).toBe(true);
    });

    it('routes LINK_ADD to handler and returns clientAction', async () => {
      const intent = classifyIntent(
        'add link to https://instagram.com/myhandle'
      );
      expect(intent).not.toBeNull();

      const result = await routeIntent(intent!, mockContext);
      expect(result).not.toBeNull();
      expect(result!.clientAction).toBeDefined();
    });

    it('routes AVATAR_UPLOAD to handler and returns propose_avatar_upload clientAction', async () => {
      const intent = classifyIntent('upload my photo');
      expect(intent).not.toBeNull();

      const result = await routeIntent(intent!, mockContext);
      expect(result).not.toBeNull();
      expect(result!.clientAction).toBe('propose_avatar_upload');
    });

    it('AI_REQUIRED category has no handler — returns null (goes to AI path)', async () => {
      const aiIntent = {
        category: IntentCategory.AI_REQUIRED,
        confidence: 1.0,
        extractedData: {},
        rawMessage: 'help me write a bio',
      };

      const result = await routeIntent(aiIntent, mockContext);
      expect(result).toBeNull();
    });

    it('calls the profile mutation with the correct clerkUserId for name changes', async () => {
      const { updateProfileByClerkId } = await import(
        '@/lib/services/profile/mutations'
      );
      const mockUpdate = vi.mocked(updateProfileByClerkId);
      mockUpdate.mockClear();

      const intent = classifyIntent('change name to Verified Artist');
      await routeIntent(intent!, {
        clerkUserId: 'clerk_specific_user',
        profileId: 'profile_abc',
      });

      expect(mockUpdate).toHaveBeenCalledWith('clerk_specific_user', {
        displayName: 'Verified Artist',
      });
    });

    it('calls the profile mutation with the correct bio value', async () => {
      const { updateProfileByClerkId } = await import(
        '@/lib/services/profile/mutations'
      );
      const mockUpdate = vi.mocked(updateProfileByClerkId);
      mockUpdate.mockClear();

      const intent = classifyIntent(
        'update my bio to Artist based in Brooklyn'
      );
      await routeIntent(intent!, mockContext);

      expect(mockUpdate).toHaveBeenCalledWith(mockContext.clerkUserId, {
        bio: 'Artist based in Brooklyn',
      });
    });
  });

  describe('priority ordering guarantees', () => {
    it('name update patterns take precedence over other CRUD operations', () => {
      const intent = classifyIntent('change name to Something New');
      expect(intent!.category).toBe(IntentCategory.PROFILE_UPDATE_NAME);
    });

    it('bio update patterns are distinct from name update patterns', () => {
      const nameIntent = classifyIntent('change name to Artist Name');
      const bioIntent = classifyIntent('change bio to Artist bio text');
      expect(nameIntent!.category).toBe(IntentCategory.PROFILE_UPDATE_NAME);
      expect(bioIntent!.category).toBe(IntentCategory.PROFILE_UPDATE_BIO);
    });

    it('link URL patterns take priority over platform-only patterns', () => {
      const intent = classifyIntent(
        'add instagram https://instagram.com/myprofile'
      );
      expect(intent!.category).toBe(IntentCategory.LINK_ADD);
      expect(intent!.extractedData.url).toBeDefined();
    });
  });
});
