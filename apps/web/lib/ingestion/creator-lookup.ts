import type { ExtractionResult } from '@/lib/ingestion/types';
import { ExtractionError } from './strategies/base';
import {
  extractInstagram,
  fetchInstagramDocument,
  validateInstagramUrl,
} from './strategies/instagram';
import {
  extractLinktree,
  fetchLinktreeDocument,
  validateLinktreeUrl,
} from './strategies/linktree';
import {
  extractTikTok,
  fetchTikTokDocument,
  validateTikTokUrl,
} from './strategies/tiktok';
import {
  extractYouTube,
  fetchYouTubeAboutDocument,
  validateYouTubeChannelUrl,
} from './strategies/youtube';

export type CreatorLookupPlatform =
  | 'youtube'
  | 'instagram'
  | 'tiktok'
  | 'linktree';

export interface CreatorLookupResult {
  readonly platform: CreatorLookupPlatform;
  readonly sourceUrl: string;
  readonly displayName: string | null;
  readonly bio: string | null;
  readonly avatarUrl: string | null;
  readonly links: ExtractionResult['links'];
}

interface CreatorLookupStrategy {
  readonly platform: CreatorLookupPlatform;
  readonly validate: (url: string) => string | null;
  readonly extract: (url: string) => Promise<ExtractionResult>;
}

const STRATEGIES: readonly CreatorLookupStrategy[] = [
  {
    platform: 'youtube',
    validate: validateYouTubeChannelUrl,
    extract: async url => extractYouTube(await fetchYouTubeAboutDocument(url)),
  },
  {
    platform: 'instagram',
    validate: validateInstagramUrl,
    extract: async url => extractInstagram(await fetchInstagramDocument(url)),
  },
  {
    platform: 'tiktok',
    validate: validateTikTokUrl,
    extract: async url => extractTikTok(await fetchTikTokDocument(url)),
  },
  {
    platform: 'linktree',
    validate: validateLinktreeUrl,
    extract: async url =>
      extractLinktree(await fetchLinktreeDocument(url), {
        includeContactEmail: false,
      }),
  },
];

/** Read public creator fields without creating or modifying a Jovie profile. */
export async function lookupCreator(
  inputUrl: string
): Promise<CreatorLookupResult | null> {
  for (const strategy of STRATEGIES) {
    const sourceUrl = strategy.validate(inputUrl);
    if (!sourceUrl) continue;

    const extracted = await strategy.extract(sourceUrl);
    if (
      !extracted.displayName &&
      !extracted.bio &&
      !extracted.avatarUrl &&
      extracted.links.length === 0
    ) {
      // Agents trust a 200; an empty one would read as a real, blank creator.
      throw new ExtractionError(
        `${strategy.platform} served no public profile data`,
        'EMPTY_RESPONSE'
      );
    }
    return {
      platform: strategy.platform,
      sourceUrl,
      displayName: extracted.displayName ?? null,
      bio: extracted.bio ?? null,
      avatarUrl: extracted.avatarUrl ?? null,
      links: extracted.links,
    };
  }

  return null;
}
