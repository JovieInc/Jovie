import { beforeEach, describe, expect, it, vi } from 'vitest';
import { profileBioHandler } from '@/lib/intent-detection/handlers/profile-bio';
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
    category: IntentCategory.PROFILE_UPDATE_BIO,
    confidence: 1.0,
    extractedData: { value },
    rawMessage: `change my bio to ${value}`,
  };
}

describe('profileBioHandler', () => {
  beforeEach(() => {
    mockUpdate.mockReset();
  });

  it('updates bio successfully', async () => {
    mockUpdate.mockResolvedValueOnce({
      id: 'profile_456',
      bio: 'New bio text',
    } as any);

    const result = await profileBioHandler.handle(
      makeIntent('New bio text'),
      baseContext
    );

    expect(result.success).toBe(true);
    expect(result.data?.bio).toBe('New bio text');
    expect(mockUpdate).toHaveBeenCalledWith('user_123', {
      bio: 'New bio text',
    });
  });

  it('rejects empty bio', async () => {
    const result = await profileBioHandler.handle(makeIntent(''), baseContext);
    expect(result.success).toBe(false);
  });

  it('rejects bio over 500 characters', async () => {
    const result = await profileBioHandler.handle(
      makeIntent('a'.repeat(501)),
      baseContext
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain('too long');
  });

  it('handles profile not found', async () => {
    mockUpdate.mockResolvedValueOnce(null);

    const result = await profileBioHandler.handle(
      makeIntent('Test bio'),
      baseContext
    );
    expect(result.success).toBe(false);
  });
});
