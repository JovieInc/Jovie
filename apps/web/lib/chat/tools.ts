import { tool } from 'ai';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { buildArtistBioDraft } from '@/lib/ai/artist-bio-writer';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { upsertRelease } from '@/lib/discography/queries';
import { generateUniqueSlug } from '@/lib/discography/slug';
import {
  buildCanvasMetadata,
  getCanvasStatusFromMetadata,
  summarizeCanvasStatus,
} from '@/lib/services/canvas/service';
import type { CanvasStatus } from '@/lib/services/canvas/types';
import { toISOStringOrNull } from '@/lib/utils/date';
import type { ArtistContext } from './context';

/**
 * Editable profile fields by tier:
 * - Tier 1 (Safe): Non-destructive fields that can be freely edited
 * - Tier 2 (Careful): Fields that need confirmation before applying
 * - Tier 3 (Blocked): Cannot be edited via chat - requires settings page
 */
const EDITABLE_FIELDS = {
  tier1: ['displayName', 'bio'] as const,
  tier2: [] as const,
  blocked: ['username', 'spotifyId', 'genres'] as const,
};

type EditableField = (typeof EDITABLE_FIELDS.tier1)[number];

const FIELD_DESCRIPTIONS: Record<EditableField, string> = {
  displayName: 'Display name shown on your profile',
  bio: 'Artist bio/description',
};

/** Lightweight release info for chat context (avoids loading full provider data). */
interface ReleaseContext {
  readonly id: string;
  readonly title: string;
  readonly releaseType: string;
  readonly releaseDate: string | null;
  readonly artworkUrl: string | null;
  readonly spotifyPopularity: number | null;
  readonly totalTracks: number;
  readonly canvasStatus: CanvasStatus;
  readonly metadata: Record<string, unknown> | null;
}

/**
 * Find a release by title (exact match first, then partial).
 * Returns null if no match found.
 */
function findReleaseByTitle(
  releases: ReleaseContext[],
  title: string
): ReleaseContext | null {
  const lower = title.toLowerCase();
  return (
    releases.find(r => r.title.toLowerCase() === lower) ??
    releases.find(r => r.title.toLowerCase().includes(lower)) ??
    null
  );
}

/** Format available release titles for error messages. */
function formatAvailableReleases(releases: ReleaseContext[]): string {
  return releases
    .slice(0, 10)
    .map(r => r.title)
    .join(', ');
}

/**
 * Fetches release data for the chat context.
 * Used by creative tools (canvas, social ads, related artists).
 */
async function fetchReleasesForChat(
  profileId: string
): Promise<ReleaseContext[]> {
  const releases = await db
    .select({
      id: discogReleases.id,
      title: discogReleases.title,
      releaseType: discogReleases.releaseType,
      releaseDate: discogReleases.releaseDate,
      artworkUrl: discogReleases.artworkUrl,
      spotifyPopularity: discogReleases.spotifyPopularity,
      totalTracks: discogReleases.totalTracks,
      metadata: discogReleases.metadata,
    })
    .from(discogReleases)
    .where(eq(discogReleases.creatorProfileId, profileId))
    .orderBy(desc(discogReleases.releaseDate))
    .limit(50);

  return releases.map(r => ({
    ...r,
    releaseDate: toISOStringOrNull(r.releaseDate),
    canvasStatus: getCanvasStatusFromMetadata(r.metadata),
  }));
}

/**
 * Creates the proposeProfileEdit tool for the AI to suggest profile changes.
 * This tool only returns a preview - actual changes require user confirmation.
 */
function createProfileEditTool(context: ArtistContext) {
  const profileEditSchema = z.object({
    field: z.enum(['displayName', 'bio']).describe('The profile field to edit'),
    newValue: z.string().describe('The new value for the field.'),
    reason: z
      .string()
      .optional()
      .describe('Brief explanation of why this change was suggested'),
  });

  return tool({
    description:
      'Propose a profile edit for the artist. Returns a preview that the user must confirm before it takes effect. Use this when the artist asks to update their display name or bio.',
    inputSchema: profileEditSchema,
    execute: async ({ field, newValue, reason }) => {
      // Return preview data for the UI to render
      return {
        success: true,
        preview: {
          field,
          fieldLabel: FIELD_DESCRIPTIONS[field],
          currentValue: context[field],
          newValue,
          reason,
        },
      };
    },
  });
}

/**
 * Creates the checkCanvasStatus tool for querying release canvas status.
 * Fetches release data and reports which releases need canvas videos.
 */
function createCheckCanvasStatusTool(profileId: string | null) {
  return tool({
    description:
      "Check which of the artist's releases have Spotify Canvas videos set and which are missing them. Use this when the artist asks about canvas videos or wants to generate them.",
    inputSchema: z.object({
      includeAll: z
        .boolean()
        .optional()
        .describe(
          'If true, include all releases. If false (default), only show releases missing canvas.'
        ),
    }),
    execute: async ({ includeAll }) => {
      if (!profileId) {
        return {
          success: false,
          error: 'Profile ID required for release data',
        };
      }

      const releases = await fetchReleasesForChat(profileId);

      if (releases.length === 0) {
        return {
          success: true,
          summary: {
            total: 0,
            message:
              'No releases found. Connect your Spotify account and sync your releases first.',
          },
        };
      }

      const summary = summarizeCanvasStatus(
        releases.map(r => ({
          id: r.id,
          title: r.title,
          metadata: r.metadata,
          artworkUrl: r.artworkUrl,
        }))
      );

      const releaseList = includeAll
        ? releases.map(r => ({
            title: r.title,
            releaseType: r.releaseType,
            canvasStatus: r.canvasStatus,
            hasArtwork: Boolean(r.artworkUrl),
            spotifyPopularity: r.spotifyPopularity,
          }))
        : summary.releasesNeedingCanvas.map(r => ({
            title: r.title,
            hasArtwork: r.hasArtwork,
          }));

      return {
        success: true,
        summary: {
          total: summary.total,
          withCanvas: summary.withCanvas,
          withoutCanvas: summary.withoutCanvas,
        },
        releases: releaseList,
      };
    },
  });
}

/**
 * Creates the suggestRelatedArtists tool.
 * Uses the artist's profile data to suggest related artists for pitching and ad targeting.
 */
function createSuggestRelatedArtistsTool(context: ArtistContext) {
  return tool({
    description:
      "Suggest related artists for playlist pitching, ad targeting, and collaboration based on the artist's genre, style, and popularity level. Returns advice on which artists to target.",
    inputSchema: z.object({
      purpose: z
        .enum(['playlist_pitching', 'ad_targeting', 'collaboration', 'all'])
        .describe('What the related artists will be used for'),
      count: z
        .number()
        .int()
        .min(3)
        .max(15)
        .optional()
        .describe('Number of suggestions to return (default 5)'),
    }),
    execute: async ({ purpose, count: suggestionCount }) => {
      // Provide the AI with structured context to generate recommendations
      return {
        success: true,
        artistContext: {
          name: context.displayName,
          genres: context.genres,
          spotifyFollowers: context.spotifyFollowers,
          spotifyPopularity: context.spotifyPopularity,
          purpose,
          requestedCount: suggestionCount ?? 5,
        },
        instructions:
          'Based on the artist context above, suggest related artists. Consider: genre alignment, similar popularity tier (aim slightly higher for pitching), audience overlap potential, and the specific purpose. For ad targeting, include both larger and smaller artists in the same niche. For playlist pitching, focus on artists who are on playlists the user would want to be on.',
      };
    },
  });
}

/**
 * Creates the generateCanvasPlan tool.
 * Helps the artist plan a canvas video generation from their album artwork.
 */
function createGenerateCanvasPlanTool(profileId: string | null) {
  return tool({
    description:
      'Generate a detailed plan for creating a Spotify Canvas video from album artwork. Includes artwork processing steps, animation style recommendations, and technical specs. Use this when an artist wants to create a canvas for a specific release.',
    inputSchema: z.object({
      releaseTitle: z
        .string()
        .describe('The title of the release to generate canvas for'),
      motionPreference: z
        .enum(['zoom', 'pan', 'particles', 'morph', 'ambient'])
        .optional()
        .describe(
          'Preferred animation style. Default: ambient (subtle motion with color shifts)'
        ),
    }),
    execute: async ({ releaseTitle, motionPreference }) => {
      if (!profileId) {
        return { success: false, error: 'Profile ID required' };
      }

      const releases = await fetchReleasesForChat(profileId);
      const release = findReleaseByTitle(releases, releaseTitle);

      if (!release) {
        return {
          success: false,
          error: `Release "${releaseTitle}" not found. Available releases: ${formatAvailableReleases(releases)}`,
        };
      }

      return buildCanvasPlan(release, motionPreference);
    },
  });
}

function buildCanvasPlan(
  release: ReleaseContext,
  motionPreference = 'ambient'
) {
  const motion = motionPreference;
  const hasArtwork = Boolean(release.artworkUrl);

  return {
    success: true,
    plan: {
      release: {
        title: release.title,
        type: release.releaseType,
        hasArtwork,
        artworkUrl: release.artworkUrl,
        currentCanvasStatus: release.canvasStatus,
      },
      steps: [
        {
          step: 1,
          action: 'Process Artwork',
          description: hasArtwork
            ? 'AI removes text/logos from album art and upscales to 1080x1920 (9:16 portrait)'
            : 'No artwork available — upload album art first, then we can generate a canvas',
          status: hasArtwork ? 'ready' : 'blocked',
        },
        {
          step: 2,
          action: 'Generate Video',
          description: `Create a ${motion} animation loop (3-8 seconds) from the processed artwork`,
          status: hasArtwork ? 'ready' : 'blocked',
        },
        {
          step: 3,
          action: 'Encode & Download',
          description:
            'Encode to H.264 MP4 at 30fps, ready for upload to Spotify for Artists',
          status: hasArtwork ? 'ready' : 'blocked',
        },
        {
          step: 4,
          action: 'Upload to Spotify',
          description:
            'Download the video and upload it via Spotify for Artists → Music → Select track → Canvas',
          status: 'manual',
        },
      ],
      motionStyle: motion,
      specs: {
        resolution: '1080x1920',
        aspectRatio: '9:16',
        duration: '3-8 seconds (loops)',
        format: 'MP4 (H.264)',
        fps: 30,
      },
    },
  };
}

/**
 * Creates the createPromoStrategy tool.
 * Generates a promotional strategy including social ads, TikTok, and canvas.
 */
function createPromoStrategyTool(
  context: ArtistContext,
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

/**
 * Creates the markCanvasUploaded tool.
 * Lets artists self-report that they've uploaded a canvas to Spotify for Artists.
 * Since Spotify has no public API for canvas status, this is the only reliable way to track it.
 */
function createMarkCanvasUploadedTool(profileId: string | null) {
  return tool({
    description:
      "Mark a release as having a Spotify Canvas video uploaded. Use this when the artist confirms they've already set a canvas for a track/release in Spotify for Artists, or when they tell you a canvas is already uploaded.",
    inputSchema: z.object({
      releaseTitle: z
        .string()
        .describe('The title of the release that has a canvas uploaded'),
    }),
    execute: async ({ releaseTitle }) => {
      if (!profileId) {
        return { success: false, error: 'Profile ID required' };
      }

      const releases = await fetchReleasesForChat(profileId);
      const release = findReleaseByTitle(releases, releaseTitle);

      if (!release) {
        return {
          success: false,
          error: `Release "${releaseTitle}" not found. Available releases: ${formatAvailableReleases(releases)}`,
        };
      }

      // Update the release metadata with canvas status
      await db
        .update(discogReleases)
        .set({
          metadata: {
            ...release.metadata,
            ...buildCanvasMetadata('uploaded'),
          },
          updatedAt: new Date(),
        })
        .where(eq(discogReleases.id, release.id));

      return {
        success: true,
        release: {
          title: release.title,
          previousStatus: release.canvasStatus,
          newStatus: 'uploaded',
        },
        message: `Marked "${release.title}" as having a Spotify Canvas uploaded.`,
      };
    },
  });
}

/**
 * Creates the createRelease tool for the AI to add new releases to the artist's discography.
 * This tool directly creates the release in the database and returns the result.
 */
function createReleaseTool(resolvedProfileId: string) {
  const createReleaseSchema = z.object({
    title: z.string().min(1).max(200).describe('The title of the release'),
    releaseType: z
      .enum([
        'single',
        'ep',
        'album',
        'compilation',
        'live',
        'mixtape',
        'other',
      ])
      .describe('The type of release'),
    releaseDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
      .optional()
      .describe(
        'Release date in ISO 8601 format (YYYY-MM-DD). Use the date the music was or will be released.'
      ),
    label: z.string().max(200).optional().describe('Record label name, if any'),
    upc: z
      .string()
      .max(20)
      .optional()
      .describe('UPC/EAN barcode for the release, if known'),
  });

  return tool({
    description:
      "Create a new release in the artist's discography. Use this when the artist wants to add a release that isn't synced from Spotify — for example, a new single, EP, or album they want to set up smart links for. Ask for the title and release type at minimum before calling this tool.",
    inputSchema: createReleaseSchema,
    execute: async ({ title, releaseType, releaseDate, label, upc }) => {
      try {
        // Validate date if provided
        let parsedDate: Date | null = null;
        if (releaseDate) {
          parsedDate = new Date(releaseDate);
          if (Number.isNaN(parsedDate.getTime())) {
            return {
              success: false,
              error: 'Invalid date. Please use YYYY-MM-DD format.',
            };
          }
        }

        const slug = await generateUniqueSlug(
          resolvedProfileId,
          title,
          'release'
        );

        const release = await upsertRelease({
          creatorProfileId: resolvedProfileId,
          title,
          slug,
          releaseType,
          releaseDate: parsedDate,
          label: label ?? null,
          upc: upc ?? null,
          sourceType: 'manual',
        });

        return {
          success: true,
          release: {
            id: release.id,
            title: release.title,
            slug: release.slug,
            releaseType: release.releaseType,
            releaseDate: release.releaseDate?.toISOString() ?? null,
            label: release.label,
          },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to create release';
        return { success: false, error: message };
      }
    },
  });
}

/**
 * Creates the writeWorldClassBio tool.
 * Produces an AllMusic-style draft using profile + DSP context.
 */
function createWorldClassBioTool(
  context: ArtistContext,
  profileId: string | null
) {
  return tool({
    description:
      'Write a world-class artist bio in an editorial style suitable for Spotify, Apple Music, and press use. Uses real artist context from profile + DSP metadata.',
    inputSchema: z.object({
      goal: z
        .enum(['spotify', 'apple_music', 'press_kit', 'general'])
        .optional()
        .describe('Primary usage context for the bio draft'),
      tone: z
        .enum(['cinematic', 'intimate', 'confident', 'elevated'])
        .optional()
        .describe('Preferred writing tone while maintaining factual rigor'),
      maxWords: z
        .number()
        .int()
        .min(80)
        .max(350)
        .optional()
        .describe('Maximum words for the returned draft (default 180)'),
    }),
    execute: async ({ goal, tone, maxWords }) => {
      let releases: Awaited<ReturnType<typeof fetchReleasesForChat>> = [];
      try {
        releases = profileId ? await fetchReleasesForChat(profileId) : [];
      } catch {
        // Non-fatal: proceed with empty releases rather than failing the tool
      }
      const wordLimit = maxWords ?? 180;
      const draftPackage = buildArtistBioDraft({
        artistName: context.displayName,
        existingBio: context.bio,
        genres: context.genres,
        spotifyFollowers: context.spotifyFollowers,
        spotifyPopularity: context.spotifyPopularity,
        spotifyUrl: context.spotifyUrl ?? null,
        appleMusicUrl: context.appleMusicUrl ?? null,
        profileViews: context.profileViews,
        releaseCount: releases.length,
        notableReleases: releases.slice(0, 3).map(release => release.title),
      });

      const trimmedDraft =
        draftPackage.draft.split(/\s+/).length > wordLimit
          ? `${draftPackage.draft.split(/\s+/).slice(0, wordLimit).join(' ')}…`
          : draftPackage.draft;

      return {
        success: true,
        usageGoal: goal ?? 'general',
        tone: tone ?? 'elevated',
        maxWords: wordLimit,
        draft: trimmedDraft,
        facts: draftPackage.facts,
        voiceDirectives: draftPackage.voiceDirectives,
        releaseContext: releases.slice(0, 5).map(release => ({
          title: release.title,
          releaseType: release.releaseType,
          releaseDate: release.releaseDate,
          spotifyPopularity: release.spotifyPopularity,
        })),
      };
    },
  });
}

/**
 * Build the tool set for paid-plan chat sessions.
 */
export function buildChatTools(
  artistContext: ArtistContext,
  resolvedProfileId: string | null
) {
  return {
    proposeProfileEdit: createProfileEditTool(artistContext),
    checkCanvasStatus: createCheckCanvasStatusTool(resolvedProfileId),
    suggestRelatedArtists: createSuggestRelatedArtistsTool(artistContext),
    writeWorldClassBio: createWorldClassBioTool(
      artistContext,
      resolvedProfileId
    ),
    generateCanvasPlan: createGenerateCanvasPlanTool(resolvedProfileId),
    createPromoStrategy: createPromoStrategyTool(
      artistContext,
      resolvedProfileId
    ),
    markCanvasUploaded: createMarkCanvasUploadedTool(resolvedProfileId),
    ...(resolvedProfileId
      ? { createRelease: createReleaseTool(resolvedProfileId) }
      : {}),
  };
}
