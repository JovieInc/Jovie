import { beforeEach, describe, expect, it, vi } from 'vitest';
import { profileNameHandler } from '@/lib/intent-detection/handlers/profile-name';
import type { HandlerContext } from '@/lib/intent-detection/handlers/types';
import {
  type DetectedIntent,
  IntentCategory,
} from '@/lib/intent-detection/types';

vi.mock('@/lib/services/profile/mutations', () => ({
  updateProfileByClerkId: vi.fn(),
}));

import { updateProfileByClerkId } from '@/lib/services/profile/mutations';

const mockUpdate = vi.mocked(updateProfileByClerkId);

const baseContext: HandlerContext = {
  clerkUserId: 'user_123',
  profileId: 'profile_456',
};

function makeIntent(value: string): DetectedIntent {
  return {
    category: IntentCategory.PROFILE_UPDATE_NAME,
    confidence: 1.0,
    extractedData: { value },
    rawMessage: `change my name to ${value}`,
  };
}

describe('profileNameHandler', () => {
  beforeEach(() => {
    mockUpdate.mockReset();
  });

  it('updates profile name successfully', async () => {
    mockUpdate.mockResolvedValueOnce({
      id: 'profile_456',
      displayName: 'DJ Shadow',
    } as any);

    const result = await profileNameHandler.handle(
      makeIntent('DJ Shadow'),
      baseContext
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain('DJ Shadow');
    expect(result.data?.displayName).toBe('DJ Shadow');
    expect(mockUpdate).toHaveBeenCalledWith('user_123', {
      displayName: 'DJ Shadow',
    });
  });

  it('rejects empty name', async () => {
    const result = await profileNameHandler.handle(makeIntent(''), baseContext);
    expect(result.success).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects name over 100 characters', async () => {
    const result = await profileNameHandler.handle(
      makeIntent('a'.repeat(101)),
      baseContext
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain('too long');
  });

  it('handles profile not found', async () => {
    mockUpdate.mockResolvedValueOnce(null);

    const result = await profileNameHandler.handle(
      makeIntent('Test'),
      baseContext
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain('Could not find');
  });
});
