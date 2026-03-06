import { describe, expect, it, vi } from 'vitest';
import { routeIntent } from '@/lib/intent-detection/handlers/router';
import type { HandlerContext } from '@/lib/intent-detection/handlers/types';
import {
  type DetectedIntent,
  IntentCategory,
} from '@/lib/intent-detection/types';

vi.mock('@/lib/services/profile/mutations', () => ({
  updateProfileByClerkId: vi.fn().mockResolvedValue({
    id: 'profile_456',
    displayName: 'Test',
  }),
}));

const baseContext: HandlerContext = {
  clerkUserId: 'user_123',
  profileId: 'profile_456',
};

describe('routeIntent', () => {
  it('routes PROFILE_UPDATE_NAME to profile name handler', async () => {
    const intent: DetectedIntent = {
      category: IntentCategory.PROFILE_UPDATE_NAME,
      confidence: 1.0,
      extractedData: { value: 'New Name' },
      rawMessage: 'change my name to New Name',
    };

    const result = await routeIntent(intent, baseContext);
    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
  });

  it('routes AVATAR_UPLOAD to avatar handler', async () => {
    const intent: DetectedIntent = {
      category: IntentCategory.AVATAR_UPLOAD,
      confidence: 1.0,
      extractedData: {},
      rawMessage: 'upload my photo',
    };

    const result = await routeIntent(intent, baseContext);
    expect(result).not.toBeNull();
    expect(result!.clientAction).toBe('propose_avatar_upload');
  });

  it('routes LINK_ADD to link add handler', async () => {
    const intent: DetectedIntent = {
      category: IntentCategory.LINK_ADD,
      confidence: 1.0,
      extractedData: { platform: 'spotify' },
      rawMessage: 'add spotify',
    };

    const result = await routeIntent(intent, baseContext);
    expect(result).not.toBeNull();
    expect(result!.clientAction).toBe('prompt_link_url');
  });

  it('returns null for unhandled categories', async () => {
    const intent: DetectedIntent = {
      category: IntentCategory.AI_REQUIRED,
      confidence: 1.0,
      extractedData: {},
      rawMessage: 'help me',
    };

    const result = await routeIntent(intent, baseContext);
    expect(result).toBeNull();
  });

  it('returns null for SETTINGS_TOGGLE (no handler registered)', async () => {
    const intent: DetectedIntent = {
      category: IntentCategory.SETTINGS_TOGGLE,
      confidence: 1.0,
      extractedData: { setting: 'tipping' },
      rawMessage: 'enable tipping',
    };

    const result = await routeIntent(intent, baseContext);
    expect(result).toBeNull();
  });
});
