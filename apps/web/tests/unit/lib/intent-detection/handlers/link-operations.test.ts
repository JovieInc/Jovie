import { describe, expect, it } from 'vitest';
import { linkAddHandler } from '@/lib/intent-detection/handlers/link-add';
import { linkRemoveHandler } from '@/lib/intent-detection/handlers/link-remove';
import type { HandlerContext } from '@/lib/intent-detection/handlers/types';
import {
  type DetectedIntent,
  IntentCategory,
} from '@/lib/intent-detection/types';

const baseContext: HandlerContext = {
  clerkUserId: 'user_123',
  profileId: 'profile_456',
};

describe('linkAddHandler', () => {
  it('returns propose_social_link when URL is provided', async () => {
    const intent: DetectedIntent = {
      category: IntentCategory.LINK_ADD,
      confidence: 1.0,
      extractedData: {
        platform: 'instagram',
        url: 'https://instagram.com/artist',
      },
      rawMessage: 'add instagram https://instagram.com/artist',
    };

    const result = await linkAddHandler.handle(intent, baseContext);
    expect(result.success).toBe(true);
    expect(result.clientAction).toBe('propose_social_link');
    expect(result.data?.url).toBe('https://instagram.com/artist');
  });

  it('returns prompt_link_url when only platform is provided', async () => {
    const intent: DetectedIntent = {
      category: IntentCategory.LINK_ADD,
      confidence: 1.0,
      extractedData: { platform: 'spotify' },
      rawMessage: 'add spotify',
    };

    const result = await linkAddHandler.handle(intent, baseContext);
    expect(result.success).toBe(true);
    expect(result.clientAction).toBe('prompt_link_url');
    expect(result.data?.platform).toBe('spotify');
  });

  it('returns failure when no platform or URL', async () => {
    const intent: DetectedIntent = {
      category: IntentCategory.LINK_ADD,
      confidence: 1.0,
      extractedData: {},
      rawMessage: 'add link',
    };

    const result = await linkAddHandler.handle(intent, baseContext);
    expect(result.success).toBe(false);
  });
});

describe('linkRemoveHandler', () => {
  it('returns propose_social_link_removal with platform', async () => {
    const intent: DetectedIntent = {
      category: IntentCategory.LINK_REMOVE,
      confidence: 1.0,
      extractedData: { platform: 'instagram' },
      rawMessage: 'remove my instagram',
    };

    const result = await linkRemoveHandler.handle(intent, baseContext);
    expect(result.success).toBe(true);
    expect(result.clientAction).toBe('propose_social_link_removal');
    expect(result.data?.platform).toBe('instagram');
  });

  it('returns failure when no platform specified', async () => {
    const intent: DetectedIntent = {
      category: IntentCategory.LINK_REMOVE,
      confidence: 1.0,
      extractedData: {},
      rawMessage: 'remove link',
    };

    const result = await linkRemoveHandler.handle(intent, baseContext);
    expect(result.success).toBe(false);
  });
});
