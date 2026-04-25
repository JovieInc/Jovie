import { tool } from 'ai';
import { z } from 'zod';
import {
  type ArtistContextLike,
  fetchReleasesForChat,
  findReleaseByTitle,
  type ReleaseContext,
} from './shared';

export function createPromoStrategyTool(
  context: ArtistContextLike,
  profileId: string | null
) {
  return tool({
    description:
      'Create a comprehensive promotion strategy for a release, including social media video ads, TikTok strategy, Spotify Canvas, and ad targeting recommendations. Use this when an artist asks for help promoting their music.',
    inputSchema: z.object({
      releaseTitle: z
        .string()
        .optional()
        .describe(
          'Specific release to promote. If not provided, uses the latest release.'
        ),
      budget: z
        .enum(['free', 'low', 'medium', 'high'])
        .optional()
        .describe(
          'Budget level: free (organic only), low ($50-200), medium ($200-1000), high ($1000+)'
        ),
      platforms: z
        .array(
          z.enum(['tiktok', 'instagram', 'youtube', 'spotify', 'hulu', 'meta'])
        )
        .optional()
        .describe('Target platforms for the promotion'),
    }),
    execute: async ({ releaseTitle, budget, platforms }) => {
      let targetRelease: ReleaseContext | null = null;

      if (profileId) {
        const releases = await fetchReleasesForChat(profileId);
        targetRelease = releaseTitle
          ? findReleaseByTitle(releases, releaseTitle)
          : (releases[0] ?? null);
      }

      return {
        success: true,
        context: {
          artist: {
            name: context.displayName,
            genres: context.genres,
            followers: context.spotifyFollowers,
            popularity: context.spotifyPopularity,
          },
          release: targetRelease
            ? {
                title: targetRelease.title,
                type: targetRelease.releaseType,
                hasArtwork: Boolean(targetRelease.artworkUrl),
                canvasStatus: targetRelease.canvasStatus,
                popularity: targetRelease.spotifyPopularity,
              }
            : null,
          budget: budget ?? 'low',
          platforms: platforms ?? ['tiktok', 'instagram', 'spotify'],
        },
        instructions:
          'Create a specific, actionable promo strategy. Include: (1) Spotify Canvas plan if not set, (2) Social video ad concepts using album art + 30s song clip + promo text + QR code to Jovie, (3) TikTok sound strategy with best clip selection advice, (4) Related artist targeting for ads, (5) Timeline with specific daily/weekly actions. Be concrete — no vague advice.',
      };
    },
  });
}
