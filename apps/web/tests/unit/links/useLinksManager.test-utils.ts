import { vi } from 'vitest';
import type { DetectedLink } from '@/lib/utils/platform-detection';

export type LinksManagerHandleAdd = {
  current: {
    handleAdd: (link: DetectedLink) => Promise<void>;
  };
};

export async function addLinkAndFlushTimers(
  result: LinksManagerHandleAdd,
  link: DetectedLink
): Promise<void> {
  const addPromise = result.current.handleAdd(link);
  vi.advanceTimersByTime(700);
  await addPromise;
}

export function createMockLink(
  platformId: string,
  category: 'social' | 'dsp' | 'earnings' | 'custom' = 'social',
  url?: string
): DetectedLink {
  const baseUrl =
    url ??
    ({
      instagram: 'https://instagram.com/testuser',
      tiktok: 'https://tiktok.com/@testuser',
      twitter: 'https://x.com/testuser',
      youtube: 'https://youtube.com/@testchannel',
      spotify: 'https://open.spotify.com/artist/123',
      'apple-music': 'https://music.apple.com/artist/123',
      venmo: 'https://venmo.com/testuser',
      website: 'https://example.com',
    }[platformId] ||
      `https://${platformId}.com/test`);

  return {
    platform: {
      id: platformId,
      name: platformId.charAt(0).toUpperCase() + platformId.slice(1),
      category,
      icon: platformId,
      color: '#000000',
      placeholder: '',
    },
    normalizedUrl: baseUrl,
    originalUrl: baseUrl,
    suggestedTitle: `${platformId} link`,
    isValid: true,
  };
}
