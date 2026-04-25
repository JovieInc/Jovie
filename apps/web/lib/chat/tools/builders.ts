import * as Sentry from '@sentry/nextjs';
import { tool } from 'ai';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { buildArtistBioDraft } from '@/lib/ai/artist-bio-writer';
import { createProfileEditTool } from '@/lib/ai/tools/profile-edit';
import { submitChatFeedback } from '@/lib/chat/submit-feedback';
import { db } from '@/lib/db';
import { socialLinks } from '@/lib/db/schema/links';
import { formatLyricsForAppleMusic } from '@/lib/lyrics/format-lyrics-for-apple-music';
import { generateAlbumArtForChat } from '@/lib/services/album-art/generate';
import { markCanvasUploadedForRelease } from '@/lib/services/canvas/mark-uploaded';
import { summarizeCanvasStatus } from '@/lib/services/canvas/service';
import { getInsightsSummary } from '@/lib/services/insights/lifecycle';
import {
  generateAndSaveReleasePitches,
  ReleasePitchGenerationError,
} from '@/lib/services/pitch/save-generated-pitches';
import {
  createManagedRelease,
  ReleaseCreationError,
} from '@/lib/services/releases/create-release';
import { detectPlatform } from '@/lib/utils/platform-detection/detector';
import { createPromoStrategyTool } from './promo-strategy';
import {
  type ArtistContextLike,
  fetchReleasesForChat,
  findReleaseByTitle,
  formatAvailableReleases,
  type ReleaseContext,
} from './shared';

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

function createAvatarUploadTool() {
  return tool({
    description:
      'Show a profile photo upload widget in the chat. Use this when the artist wants to change, update, or set their profile photo. Do not describe how to upload — just call this tool.',
    inputSchema: z.object({}),
    execute: async () => ({ success: true, action: 'avatar_upload' as const }),
  });
}

function createSocialLinkTool() {
  return tool({
    description:
      'Propose adding a social link to the artist profile. Pass the full URL. The client will show a confirmation card with the detected platform. Use this when the artist asks to add a link or social profile URL.',
    inputSchema: z.object({
      url: z
        .string()
        .describe(
          'The full URL to add (e.g. https://instagram.com/myhandle). Construct the full URL from handles if needed.'
        ),
    }),
    execute: async ({ url }) => {
      const detected = detectPlatform(url);

      if (!detected.isValid) {
        return {
          success: false,
          error: detected.error ?? 'Invalid URL. Please provide a valid link.',
        };
      }

      return {
        success: true,
        platform: {
          id: detected.platform.id,
          name: detected.platform.name,
          icon: detected.platform.icon,
          color: detected.platform.color,
        },
        normalizedUrl: detected.normalizedUrl,
        originalUrl: detected.originalUrl,
        suggestedTitle: detected.suggestedTitle,
      };
    },
  });
}

function createSocialLinkRemovalTool(profileId: string | null) {
  return tool({
    description:
      'Propose removing a social link from the artist profile. Use this when the artist asks to remove or delete a link. Returns a confirmation card with link details. You must specify the platform name (e.g. "instagram", "spotify", "twitter") to identify which link to remove.',
    inputSchema: z.object({
      platform: z
        .string()
        .describe(
          'The platform name of the link to remove (e.g. "instagram", "spotify", "twitter", "tiktok"). Case-insensitive.'
        ),
    }),
    execute: async ({ platform }) => {
      if (!profileId) {
        return {
          success: false,
          error: 'Profile ID required to remove links',
        };
      }

      const activeLinks = await db
        .select({
          id: socialLinks.id,
          platform: socialLinks.platform,
          url: socialLinks.url,
        })
        .from(socialLinks)
        .where(
          and(
            eq(socialLinks.creatorProfileId, profileId),
            eq(socialLinks.state, 'active')
          )
        );

      if (activeLinks.length === 0) {
        return {
          success: false,
          error: 'No social links found on your profile.',
        };
      }

      const normalizedPlatform = platform.toLowerCase();
      const matchingLink = activeLinks.find(
        link => link.platform.toLowerCase() === normalizedPlatform
      );

      if (!matchingLink) {
        const available = activeLinks.map(link => link.platform).join(', ');
        return {
          success: false,
          error: `No ${platform} link found. Available links: ${available}`,
        };
      }

      return {
        success: true,
        action: 'remove_link' as const,
        linkId: matchingLink.id,
        platform: matchingLink.platform,
        url: matchingLink.url,
      };
    },
  });
}

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
        releases.map(release => ({
          id: release.id,
          title: release.title,
          metadata: release.metadata,
          artworkUrl: release.artworkUrl,
        }))
      );

      const releaseList = includeAll
        ? releases.map(release => ({
            title: release.title,
            releaseType: release.releaseType,
            canvasStatus: release.canvasStatus,
            hasArtwork: Boolean(release.artworkUrl),
            spotifyPopularity: release.spotifyPopularity,
          }))
        : summary.releasesNeedingCanvas.map(release => ({
            title: release.title,
            hasArtwork: release.hasArtwork,
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

function createSuggestRelatedArtistsTool(context: ArtistContextLike) {
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
    execute: async ({ purpose, count: suggestionCount }) => ({
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
    }),
  });
}

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

function createGenerateAlbumArtTool(params: {
  readonly profileId: string | null;
  readonly clerkUserId: string;
  readonly artistName: string;
  readonly canGenerateAlbumArt: boolean;
}) {
  return tool({
    description:
      'Generate three album art options for a release. Use this when the artist asks to generate, create, or design album artwork or cover art. If no matching release exists, return a target-selection result so the client can ask whether to create a release or attach the art to an existing release.',
    inputSchema: z.object({
      releaseTitle: z
        .string()
        .max(200)
        .optional()
        .describe('Release title to generate album art for, if known.'),
      releaseId: z
        .string()
        .uuid()
        .optional()
        .describe(
          'Exact release ID when the request came from a release menu.'
        ),
      styleId: z
        .enum([
          'neo_pop_collage',
          'chrome_noir',
          'analog_dream',
          'minimal_icon',
        ])
        .optional()
        .describe('Visual style preset for the generated cover.'),
      prompt: z
        .string()
        .max(500)
        .optional()
        .describe('Optional extra visual direction from the artist.'),
      createRelease: z
        .boolean()
        .optional()
        .describe(
          'Set true when the artist wants to generate candidates for a new release that does not exist yet.'
        ),
    }),
    execute: async input => {
      if (!params.profileId) {
        return {
          success: false as const,
          retryable: false,
          error: 'Profile ID required',
        };
      }
      if (!params.canGenerateAlbumArt) {
        return {
          success: false as const,
          retryable: false,
          error: 'Album art generation requires a Pro plan.',
        };
      }

      return generateAlbumArtForChat({
        ...input,
        profileId: params.profileId,
        clerkUserId: params.clerkUserId,
        artistName: params.artistName,
      });
    },
  });
}

function createShowTopInsightsTool(profileId: string | null) {
  return tool({
    description:
      'Show the artist their top audience, release, track, and monetization signals as structured insight cards. Use this when they ask what is working, what to focus on, or how their audience and releases are performing.',
    inputSchema: z.object({}),
    execute: async () => {
      if (!profileId) {
        return {
          success: false,
          title: 'Top signals',
          totalActive: 0,
          insights: [],
        };
      }

      const summary = await getInsightsSummary(profileId);
      return {
        success: true,
        title: 'Top signals',
        totalActive: summary.totalActive,
        insights: summary.insights,
      };
    },
  });
}

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

      try {
        const release = await markCanvasUploadedForRelease({
          profileId,
          releaseTitle,
        });
        return {
          success: true,
          release: {
            title: release.title,
            previousStatus: release.previousStatus,
            newStatus: release.newStatus,
          },
          message: `Marked "${release.title}" as having a Spotify Canvas uploaded.`,
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to update Canvas.',
        };
      }
    },
  });
}

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
        const release = await createManagedRelease({
          profileId: resolvedProfileId,
          title,
          releaseType,
          releaseDate: releaseDate ?? null,
          label: label ?? null,
          upc: upc ?? null,
        });

        return {
          success: true,
          release: {
            id: release.id,
            title: release.title,
            slug: release.slug,
            releaseType,
            releaseDate: release.releaseDate?.toISOString() ?? null,
            label: label ?? null,
          },
        };
      } catch (error) {
        const message =
          error instanceof ReleaseCreationError || error instanceof Error
            ? error.message
            : 'Failed to create release';
        return { success: false, error: message };
      }
    },
  });
}

function createWorldClassBioTool(
  context: ArtistContextLike,
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
        releases = [];
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

function createLyricsFormatTool() {
  return tool({
    description:
      'Format lyrics to Apple Music guidelines. Applies deterministic rules: removes section labels like [Verse]/[Chorus], straightens curly quotes, normalizes punctuation, collapses blank lines, and trims whitespace. Use when an artist asks to clean up or format lyrics.',
    inputSchema: z.object({
      lyrics: z
        .string()
        .min(1)
        .max(10000)
        .describe('Raw lyrics text to format for Apple Music'),
    }),
    execute: async ({ lyrics }) => {
      const originalLineCount = lyrics.split('\n').length;
      const { formatted, changesSummary } = formatLyricsForAppleMusic(lyrics);
      const formattedLineCount = formatted.split('\n').length;

      return {
        success: true,
        formatted,
        changesSummary,
        originalLineCount,
        formattedLineCount,
      };
    },
  });
}

function createSubmitFeedbackTool(clerkUserId: string) {
  return tool({
    description:
      'Submit product feedback from the artist. Use this when the artist wants to share feedback, report a bug, or request a feature. Collect their feedback message first, then call this tool with the full text.',
    inputSchema: z.object({
      message: z
        .string()
        .min(5)
        .max(2000)
        .describe('The feedback message from the artist'),
    }),
    execute: async ({ message }) =>
      submitChatFeedback({
        clerkUserId,
        message,
      }),
  });
}

function createGenerateReleasePitchTool(resolvedProfileId: string) {
  return tool({
    description:
      "Generate AI-powered playlist pitches for a release. Creates pitches formatted for Spotify, Apple Music, Amazon Music, and general use. Saves them to the release automatically. Use when the artist asks about playlist pitches, editorial submissions, or wants help submitting their music to playlists. Ask which release they want to pitch if unclear. If the artist provides custom guidance (e.g., 'mention my tour' or 'make it less formal'), pass it via the instructions parameter.",
    inputSchema: z.object({
      releaseTitle: z
        .string()
        .max(200)
        .describe('The title of the release to generate pitches for'),
      instructions: z
        .string()
        .max(500)
        .optional()
        .describe(
          'Optional instructions to guide pitch generation, e.g. "mention my Nashville show" or "make it less formal"'
        ),
    }),
    execute: async ({ releaseTitle, instructions }) => {
      try {
        const releases = await fetchReleasesForChat(resolvedProfileId);

        if (releases.length === 0) {
          return {
            success: false as const,
            error: "You don't have any releases yet. Add a release first.",
          };
        }

        const release = findReleaseByTitle(releases, releaseTitle);

        if (!release) {
          return {
            success: false as const,
            error: `Release "${releaseTitle}" not found. Available releases: ${formatAvailableReleases(releases)}`,
          };
        }

        const result = await generateAndSaveReleasePitches({
          profileId: resolvedProfileId,
          releaseId: release.id,
          instructions,
        });

        return {
          success: true as const,
          releaseTitle: release.title,
          pitches: result.pitches,
        };
      } catch (error) {
        Sentry.captureException(error, {
          tags: { feature: 'chat-pitch-generation' },
          extra: { releaseTitle, profileId: resolvedProfileId },
        });

        const message =
          error instanceof ReleasePitchGenerationError
            ? error.message
            : 'Failed to generate pitches. Please try again.';
        return {
          success: false as const,
          error: message,
        };
      }
    },
  });
}

export function buildFreeChatTools(
  resolvedProfileId: string | null,
  clerkUserId: string
) {
  return {
    proposeAvatarUpload: createAvatarUploadTool(),
    proposeSocialLink: createSocialLinkTool(),
    proposeSocialLinkRemoval: createSocialLinkRemovalTool(resolvedProfileId),
    submitFeedback: createSubmitFeedbackTool(clerkUserId),
  };
}

export function buildChatTools(
  artistContext: ArtistContextLike,
  resolvedProfileId: string | null,
  insightsEnabled: boolean,
  clerkUserId: string,
  canGenerateAlbumArt: boolean,
  albumArtEnabled: boolean
) {
  return {
    ...(insightsEnabled
      ? { showTopInsights: createShowTopInsightsTool(resolvedProfileId) }
      : {}),
    proposeProfileEdit: createProfileEditTool(artistContext),
    checkCanvasStatus: createCheckCanvasStatusTool(resolvedProfileId),
    suggestRelatedArtists: createSuggestRelatedArtistsTool(artistContext),
    writeWorldClassBio: createWorldClassBioTool(
      artistContext,
      resolvedProfileId
    ),
    generateCanvasPlan: createGenerateCanvasPlanTool(resolvedProfileId),
    ...(albumArtEnabled && canGenerateAlbumArt
      ? {
          generateAlbumArt: createGenerateAlbumArtTool({
            profileId: resolvedProfileId,
            clerkUserId,
            artistName: artistContext.displayName,
            canGenerateAlbumArt,
          }),
        }
      : {}),
    createPromoStrategy: createPromoStrategyTool(
      artistContext,
      resolvedProfileId
    ),
    markCanvasUploaded: createMarkCanvasUploadedTool(resolvedProfileId),
    formatLyrics: createLyricsFormatTool(),
    ...(resolvedProfileId
      ? {
          createRelease: createReleaseTool(resolvedProfileId),
          generateReleasePitch:
            createGenerateReleasePitchTool(resolvedProfileId),
        }
      : {}),
  };
}
