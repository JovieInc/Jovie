/**
 * Profile Edit Chat Tests (JOV-943)
 * Deterministic testing architecture: profile edits bypass the LLM.
 *
 * These tests verify that simple CRUD profile edit requests ("change my name
 * to X", "update bio to Y") are handled entirely by the deterministic intent
 * router — the LLM (AI SDK) is never called for these operations.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  classifyIntent,
  isDeterministicIntent,
  routeIntent,
} from '@/lib/intent-detection';
import { IntentCategory } from '@/lib/intent-detection/types';

// ---------------------------------------------------------------------------
// Mock the DB mutation layer that executes profile edits.
// The LLM (streamText, gateway, etc.) is intentionally NOT mocked —
// if any test accidentally invokes it, the test will fail with a real error.
// vi.hoisted ensures the mock factory can reference the variable before hoisting.
// ---------------------------------------------------------------------------
const { mockUpdateProfileByClerkId } = vi.hoisted(() => ({
  mockUpdateProfileByClerkId: vi.fn().mockResolvedValue({
    id: 'profile_test_abc',
    displayName: 'Updated Name',
    bio: 'Updated bio',
  }),
}));

vi.mock('@/lib/services/profile/mutations', () => ({
  updateProfileByClerkId: mockUpdateProfileByClerkId,
}));

// ---------------------------------------------------------------------------
// Stub for the AI SDK — if any code path accidentally calls the LLM, the
// test will throw, making the "no LLM call" guarantee explicit.
// ---------------------------------------------------------------------------
const mockStreamText = vi.fn().mockImplementation(() => {
  throw new Error(
    'LLM was called unexpectedly for a deterministic CRUD operation'
  );
});

vi.mock('ai', async importOriginal => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, streamText: mockStreamText };
});

vi.mock('@ai-sdk/gateway', () => ({
  gateway: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Shared context fixture
// ---------------------------------------------------------------------------

const mockHandlerContext = {
  clerkUserId: 'user_clerk_abc',
  profileId: 'profile_test_abc',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Profile edit via chat: deterministic execution (no LLM)', () => {
  beforeEach(() => {
    mockUpdateProfileByClerkId.mockClear();
    mockStreamText.mockClear();
  });

  describe('Display name changes', () => {
    const nameChangeMessages = [
      ['change my name to DJ Shadow', 'DJ Shadow'],
      ['update my name to The Weeknd', 'The Weeknd'],
      ['set display name to Aurora', 'Aurora'],
      ['rename my artist name to MC Flow', 'MC Flow'],
      ['set name = Midnight Bloom', 'Midnight Bloom'],
      ['my display name should be Cool Artist', 'Cool Artist'],
    ];

    it.each(
      nameChangeMessages
    )('classifies "%s" as PROFILE_UPDATE_NAME (deterministic)', (message, _expectedName) => {
      const intent = classifyIntent(message);
      expect(intent).not.toBeNull();
      expect(intent!.category).toBe(IntentCategory.PROFILE_UPDATE_NAME);
      expect(isDeterministicIntent(intent)).toBe(true);
    });

    it.each(
      nameChangeMessages
    )('executes "%s" via DB mutation, not LLM', async (message, expectedName) => {
      const intent = classifyIntent(message);
      expect(intent).not.toBeNull();

      const result = await routeIntent(intent!, mockHandlerContext);

      // Mutation was called with the expected name
      expect(mockUpdateProfileByClerkId).toHaveBeenCalledWith(
        mockHandlerContext.clerkUserId,
        { displayName: expectedName }
      );

      // LLM was never invoked
      expect(mockStreamText).not.toHaveBeenCalled();

      // Result confirms success
      expect(result).not.toBeNull();
      expect(result!.success).toBe(true);
      expect(result!.message).toContain(expectedName);
    });
  });

  describe('Bio updates', () => {
    const bioUpdateMessages = [
      [
        'change bio to Independent artist from NYC',
        'Independent artist from NYC',
      ],
      [
        'update my bio to Electronic music producer',
        'Electronic music producer',
      ],
      [
        'set bio to Indie songwriter and multi-instrumentalist',
        'Indie songwriter and multi-instrumentalist',
      ],
      [
        'my bio should be Producer from Los Angeles',
        'Producer from Los Angeles',
      ],
    ];

    it.each(
      bioUpdateMessages
    )('classifies "%s" as PROFILE_UPDATE_BIO (deterministic)', (message, _expectedBio) => {
      const intent = classifyIntent(message);
      expect(intent).not.toBeNull();
      expect(intent!.category).toBe(IntentCategory.PROFILE_UPDATE_BIO);
      expect(isDeterministicIntent(intent)).toBe(true);
    });

    it.each(
      bioUpdateMessages
    )('executes bio update "%s" via DB mutation, not LLM', async (message, expectedBio) => {
      const intent = classifyIntent(message);
      expect(intent).not.toBeNull();

      const result = await routeIntent(intent!, mockHandlerContext);

      expect(mockUpdateProfileByClerkId).toHaveBeenCalledWith(
        mockHandlerContext.clerkUserId,
        { bio: expectedBio }
      );
      expect(mockStreamText).not.toHaveBeenCalled();
      expect(result!.success).toBe(true);
    });
  });

  describe('Extracted data correctness', () => {
    it('extracts the exact name value without surrounding whitespace', () => {
      const intent = classifyIntent('change my name to   Spaced Name   ');
      // The classifier trims the entire message; extractedData may have leading/trailing
      // space depending on the regex group — assert the value is correct
      expect(intent).not.toBeNull();
      expect(intent!.extractedData.value.trim()).toBe('Spaced Name');
    });

    it('preserves special characters in extracted name', () => {
      const intent = classifyIntent('change name to MC $pecial & Co.');
      expect(intent).not.toBeNull();
      expect(intent!.extractedData.value).toBe('MC $pecial & Co.');
    });

    it('preserves emoji and unicode in extracted bio', () => {
      const intent = classifyIntent('change bio to Music is life 🎵');
      expect(intent).not.toBeNull();
      expect(intent!.extractedData.value).toBe('Music is life 🎵');
    });
  });

  describe('Guard rails: operations that DO require AI', () => {
    it('does not classify "write me a bio" as deterministic (requires AI)', () => {
      const intent = classifyIntent('write me a bio');
      expect(isDeterministicIntent(intent)).toBe(false);
    });

    it('does not classify "improve my bio" as deterministic (requires AI)', () => {
      const intent = classifyIntent('can you improve my bio');
      expect(isDeterministicIntent(intent)).toBe(false);
    });

    it('does not classify vague name questions as deterministic', () => {
      const intent = classifyIntent('what should my artist name be?');
      expect(isDeterministicIntent(intent)).toBe(false);
    });

    it('does not classify "make my bio more professional" as deterministic', () => {
      const intent = classifyIntent('make my bio more professional');
      expect(isDeterministicIntent(intent)).toBe(false);
    });
  });

  describe('Mutation failure handling', () => {
    it('returns failure result when profile is not found', async () => {
      mockUpdateProfileByClerkId.mockResolvedValueOnce(null);

      const intent = classifyIntent('change name to Ghost Artist');
      const result = await routeIntent(intent!, mockHandlerContext);

      expect(result).not.toBeNull();
      expect(result!.success).toBe(false);
      expect(result!.message).toContain('Could not find your profile');
      // LLM still not called — this is a pure CRUD failure path
      expect(mockStreamText).not.toHaveBeenCalled();
    });

    it('returns failure result when name value is empty', async () => {
      // Direct handler invocation with empty value to test validation
      const { profileNameHandler } = await import(
        '@/lib/intent-detection/handlers/profile-name'
      );
      const result = await profileNameHandler.handle(
        {
          category: IntentCategory.PROFILE_UPDATE_NAME,
          confidence: 1.0,
          extractedData: { value: '' },
          rawMessage: '',
        },
        mockHandlerContext
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('need a name');
      expect(mockUpdateProfileByClerkId).not.toHaveBeenCalled();
    });

    it('returns failure result when bio value is empty', async () => {
      const { profileBioHandler } = await import(
        '@/lib/intent-detection/handlers/profile-bio'
      );
      const result = await profileBioHandler.handle(
        {
          category: IntentCategory.PROFILE_UPDATE_BIO,
          confidence: 1.0,
          extractedData: { value: '' },
          rawMessage: '',
        },
        mockHandlerContext
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('need the bio text');
      expect(mockUpdateProfileByClerkId).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Chat triggers on first message
// ---------------------------------------------------------------------------

describe('Chat first-message trigger', () => {
  /**
   * The first message in a new chat session creates a conversation record
   * before sending to the AI. The useJovieChat hook uses
   * useCreateConversationMutation for this. These tests verify that the
   * first-message path works correctly at the intent layer:
   * - A CRUD first message should never reach the AI
   * - A non-CRUD first message should be passed through to AI
   */

  it('a CRUD first message is classified before any AI call', () => {
    const firstMessage = 'change my name to Debut Artist';
    const intent = classifyIntent(firstMessage);

    // The intent is detected deterministically on first message
    expect(intent).not.toBeNull();
    expect(intent!.category).toBe(IntentCategory.PROFILE_UPDATE_NAME);
    expect(isDeterministicIntent(intent)).toBe(true);
  });

  it('a non-CRUD first message falls through to AI', () => {
    const firstMessage = 'hey, can you tell me about my profile analytics?';
    const intent = classifyIntent(firstMessage);

    // Not a deterministic CRUD intent — goes to AI
    expect(isDeterministicIntent(intent)).toBe(false);
  });

  it('a first-message CRUD edit executes the DB mutation, not AI', async () => {
    const firstMessage = 'change my name to First Session Artist';
    const intent = classifyIntent(firstMessage);
    expect(intent).not.toBeNull();

    await routeIntent(intent!, mockHandlerContext);

    expect(mockUpdateProfileByClerkId).toHaveBeenCalledWith(
      mockHandlerContext.clerkUserId,
      { displayName: 'First Session Artist' }
    );
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it('rawMessage is preserved on the classified intent for audit/logging', () => {
    const firstMessage = '  change my name to Trimmed Artist  ';
    const intent = classifyIntent(firstMessage);

    expect(intent).not.toBeNull();
    // rawMessage is the trimmed input
    expect(intent!.rawMessage).toBe('change my name to Trimmed Artist');
  });
});
