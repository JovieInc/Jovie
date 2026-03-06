import { describe, expect, it, vi } from 'vitest';
import { routeIntent } from '@/lib/intent-detection/handlers/router';
import { IntentCategory } from '@/lib/intent-detection/types';
import { createMockContext, createMockIntent } from './test-utils';

vi.mock('@/lib/services/profile/mutations', () => ({
  updateProfileByClerkId: vi.fn().mockResolvedValue({
    id: 'profile_test_456',
    displayName: 'Updated',
    bio: 'Updated bio',
  }),
}));

describe('AI response plumbing', () => {
  describe('handler result structure', () => {
    it('profile name result has correct shape', async () => {
      const intent = createMockIntent(
        IntentCategory.PROFILE_UPDATE_NAME,
        { value: 'New Name' },
        'change my name to New Name'
      );

      const result = await routeIntent(intent, createMockContext());
      expect(result).toMatchObject({
        success: expect.any(Boolean),
        message: expect.any(String),
      });
    });

    it('link add result includes clientAction', async () => {
      const intent = createMockIntent(
        IntentCategory.LINK_ADD,
        { platform: 'spotify' },
        'add spotify'
      );

      const result = await routeIntent(intent, createMockContext());
      expect(result).not.toBeNull();
      expect(result!.clientAction).toBeDefined();
    });

    it('avatar upload result includes clientAction', async () => {
      const intent = createMockIntent(
        IntentCategory.AVATAR_UPLOAD,
        {},
        'upload my photo'
      );

      const result = await routeIntent(intent, createMockContext());
      expect(result).not.toBeNull();
      expect(result!.clientAction).toBe('propose_avatar_upload');
    });
  });

  describe('handler context propagation', () => {
    it('passes clerkUserId to profile mutation', async () => {
      const { updateProfileByClerkId } = await import(
        '@/lib/services/profile/mutations'
      );
      const mockUpdate = vi.mocked(updateProfileByClerkId);
      mockUpdate.mockClear();

      const intent = createMockIntent(
        IntentCategory.PROFILE_UPDATE_NAME,
        { value: 'Test' },
        'change my name to Test'
      );
      const context = createMockContext({ clerkUserId: 'custom_user_id' });

      await routeIntent(intent, context);
      expect(mockUpdate).toHaveBeenCalledWith('custom_user_id', {
        displayName: 'Test',
      });
    });
  });

  describe('error handling', () => {
    it('unregistered category returns null', async () => {
      const intent = createMockIntent(
        IntentCategory.AI_REQUIRED,
        {},
        'help me'
      );

      const result = await routeIntent(intent, createMockContext());
      expect(result).toBeNull();
    });

    it('settings toggle has no handler yet', async () => {
      const intent = createMockIntent(
        IntentCategory.SETTINGS_TOGGLE,
        { setting: 'tipping' },
        'enable tipping'
      );

      const result = await routeIntent(intent, createMockContext());
      expect(result).toBeNull();
    });
  });
});
