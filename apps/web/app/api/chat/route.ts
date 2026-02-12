import { gateway } from '@ai-sdk/gateway';
import { auth } from '@clerk/nextjs/server';
import * as Sentry from '@sentry/nextjs';
import { convertToModelMessages, streamText, tool, type UIMessage } from 'ai';
import { and, count, desc, sql as drizzleSql, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CHAT_MODEL } from '@/lib/constants/ai-models';
import { db } from '@/lib/db';
import { clickEvents, tips } from '@/lib/db/schema/analytics';
import { users } from '@/lib/db/schema/auth';
import { discogReleases } from '@/lib/db/schema/content';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { sqlAny } from '@/lib/db/sql-helpers';
import { upsertRelease } from '@/lib/discography/queries';
import { generateUniqueSlug } from '@/lib/discography/slug';
import { CORS_HEADERS } from '@/lib/http/headers';
import {
  checkAiChatRateLimitForPlan,
  createRateLimitHeaders,
} from '@/lib/rate-limit';
import {
  buildCanvasMetadata,
  getCanvasStatusFromMetadata,
  summarizeCanvasStatus,
} from '@/lib/services/canvas/service';
import {
  SPOTIFY_CANVAS_SPEC,
  TIKTOK_PREVIEW_SPEC,
} from '@/lib/services/canvas/specs';
import type { CanvasStatus } from '@/lib/services/canvas/types';
import { DSP_PLATFORMS } from '@/lib/services/social-links/types';
import { getPlanLimits } from '@/lib/stripe/config';
import { getUserBillingInfo } from '@/lib/stripe/customer-sync/billing-info';
import { toISOStringOrNull } from '@/lib/utils/date';

export const maxDuration = 30;

/** Maximum allowed message length (characters) */
const MAX_MESSAGE_LENGTH = 4000;

/** Maximum allowed messages per request */
const MAX_MESSAGES_PER_REQUEST = 50;

/**
 * Editable profile fields by tier:
 * - Tier 1 (Safe): Non-destructive fields that can be freely edited
 * - Tier 2 (Careful): Fields that need confirmation before applying
 * - Tier 3 (Blocked): Cannot be edited via chat - requires settings page
 */
const EDITABLE_FIELDS = {
  tier1: ['displayName', 'bio'] as const,
  tier2: [] as const,
  blocked: ['username', 'avatarUrl', 'spotifyId', 'genres'] as const,
};

type EditableField = (typeof EDITABLE_FIELDS.tier1)[number];

const FIELD_DESCRIPTIONS: Record<EditableField, string> = {
  displayName: 'Display name shown on your profile',
  bio: 'Artist bio/description',
};

/**
 * Zod schema for validating client-provided artist context.
 * Used when profileId is not provided (backward compatibility).
 */
const artistContextSchema = z.object({
  displayName: z.string().max(100),
  username: z.string().max(50),
  bio: z.string().max(500).nullable(),
  genres: z.array(z.string().max(50)).max(10),
  spotifyFollowers: z.number().int().nonnegative().nullable(),
  spotifyPopularity: z.number().int().min(0).max(100).nullable(),
  profileViews: z.number().int().nonnegative(),
  hasSocialLinks: z.boolean(),
  hasMusicLinks: z.boolean(),
  tippingStats: z.object({
    tipClicks: z.number().int().nonnegative(),
    tipsSubmitted: z.number().int().nonnegative(),
    totalReceivedCents: z.number().int().nonnegative(),
    monthReceivedCents: z.number().int().nonnegative(),
  }),
});

type ArtistContext = z.infer<typeof artistContextSchema>;

/**
 * Fetches artist context server-side from the database.
 * Validates that the profile belongs to the authenticated user.
 */
async function fetchArtistContext(
  profileId: string,
  clerkUserId: string
): Promise<ArtistContext | null> {
  // Fetch profile with ownership check via user join
  const [result] = await db
    .select({
      displayName: creatorProfiles.displayName,
      username: creatorProfiles.username,
      bio: creatorProfiles.bio,
      genres: creatorProfiles.genres,
      spotifyFollowers: creatorProfiles.spotifyFollowers,
      spotifyPopularity: creatorProfiles.spotifyPopularity,
      profileViews: creatorProfiles.profileViews,
      userClerkId: users.clerkId,
    })
    .from(creatorProfiles)
    .leftJoin(users, eq(users.id, creatorProfiles.userId))
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);

  if (result?.userClerkId !== clerkUserId) {
    return null;
  }

  // Fetch link counts and tipping stats in parallel
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);
  const startOfMonthISO = startOfMonth.toISOString();

  const [linkCounts, tipTotals, clickStats] = await Promise.all([
    db
      .select({
        totalActive: count(),
        musicActive: drizzleSql<number>`count(*) filter (where ${socialLinks.platformType} = 'dsp' OR ${socialLinks.platform} = ${sqlAny(DSP_PLATFORMS)})`,
      })
      .from(socialLinks)
      .where(
        and(
          eq(socialLinks.creatorProfileId, profileId),
          eq(socialLinks.state, 'active')
        )
      )
      .then(r => r[0]),
    db
      .select({
        totalReceived: drizzleSql<number>`COALESCE(SUM(${tips.amountCents}), 0)`,
        monthReceived: drizzleSql<number>`COALESCE(SUM(CASE WHEN ${tips.createdAt} >= ${startOfMonthISO}::timestamp THEN ${tips.amountCents} ELSE 0 END), 0)`,
        tipsSubmitted: drizzleSql<number>`COALESCE(COUNT(${tips.id}), 0)`,
      })
      .from(tips)
      .where(eq(tips.creatorProfileId, profileId))
      .then(r => r[0]),
    db
      .select({
        total: drizzleSql<number>`count(*) filter (where (${clickEvents.metadata}->>'source') in ('qr', 'link'))`,
      })
      .from(clickEvents)
      .where(
        and(
          eq(clickEvents.creatorProfileId, profileId),
          eq(clickEvents.linkType, 'tip')
        )
      )
      .then(r => r[0]),
  ]);

  return {
    displayName: result.displayName ?? result.username,
    username: result.username,
    bio: result.bio,
    genres: result.genres ?? [],
    spotifyFollowers: result.spotifyFollowers,
    spotifyPopularity: result.spotifyPopularity,
    profileViews: result.profileViews ?? 0,
    hasSocialLinks: Number(linkCounts?.totalActive ?? 0) > 0,
    hasMusicLinks: Number(linkCounts?.musicActive ?? 0) > 0,
    tippingStats: {
      tipClicks: Number(clickStats?.total ?? 0),
      tipsSubmitted: Number(tipTotals?.tipsSubmitted ?? 0),
      totalReceivedCents: Number(tipTotals?.totalReceived ?? 0),
      monthReceivedCents: Number(tipTotals?.monthReceived ?? 0),
    },
  };
}

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
 * Resolves artist context from profileId (server-side) or client-provided data.
 * Returns { context } on success or { error } with a NextResponse on failure.
 */
async function resolveArtistContext(
  profileId: unknown,
  artistContextInput: unknown,
  userId: string
): Promise<
  | { context: ArtistContext; error?: never }
  | { context?: never; error: NextResponse }
> {
  if (profileId && typeof profileId === 'string') {
    const context = await fetchArtistContext(profileId, userId);
    if (!context) {
      return {
        error: NextResponse.json(
          { error: 'Profile not found or unauthorized' },
          { status: 404, headers: CORS_HEADERS }
        ),
      };
    }
    return { context };
  }

  // Backward compatibility: accept client-provided artistContext with validation
  const parseResult = artistContextSchema.safeParse(artistContextInput);
  if (!parseResult.success) {
    return {
      error: NextResponse.json(
        {
          error: 'Invalid artistContext format',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400, headers: CORS_HEADERS }
      ),
    };
  }
  return { context: parseResult.data };
}

/**
 * Extracts text content from a UIMessage's parts array.
 */
function extractUIMessageText(
  parts: Array<{ type: string; text?: string }>
): string {
  return parts
    .filter(
      (p): p is { type: 'text'; text: string } =>
        p.type === 'text' && typeof p.text === 'string'
    )
    .map(p => p.text)
    .join('');
}

/**
 * Validates a single UIMessage object.
 * AI SDK v6 UIMessages have { id, role, parts } instead of { role, content }.
 * Returns an error message string if invalid, null if valid.
 */
function validateMessage(message: unknown): string | null {
  if (typeof message !== 'object' || message === null || !('role' in message)) {
    return 'Invalid message format';
  }

  const msg = message as Record<string, unknown>;

  if (msg.role !== 'user' && msg.role !== 'assistant') {
    return 'Invalid message role';
  }

  // UIMessages must have a parts array
  if (!('parts' in msg) || !Array.isArray(msg.parts)) {
    return 'Invalid message format';
  }

  // Validate content length for user messages
  if (msg.role === 'user') {
    const contentStr = extractUIMessageText(
      msg.parts as Array<{ type: string; text?: string }>
    );
    if (contentStr.length > MAX_MESSAGE_LENGTH) {
      return `Message too long. Maximum is ${MAX_MESSAGE_LENGTH} characters`;
    }
  }

  return null;
}

/**
 * Validates the messages array (UIMessage format).
 * Returns an error message string if invalid, null if valid.
 */
function validateMessagesArray(messages: unknown): string | null {
  if (!Array.isArray(messages)) {
    return 'Messages must be an array';
  }
  if (messages.length === 0) {
    return 'Messages array cannot be empty';
  }
  if (messages.length > MAX_MESSAGES_PER_REQUEST) {
    return `Too many messages. Maximum is ${MAX_MESSAGES_PER_REQUEST}`;
  }

  for (const message of messages) {
    const error = validateMessage(message);
    if (error) {
      return error;
    }
  }

  return null;
}

function buildSystemPrompt(
  context: ArtistContext,
  options?: { aiCanUseTools: boolean; aiDailyMessageLimit: number }
): string {
  const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return `You are Jovie, an AI music career assistant. You help independent artists understand their data and make smart career decisions.

## About This Artist
- **Name:** ${context.displayName} (@${context.username})
- **Bio:** ${context.bio ?? 'Not set'}
- **Genres:** ${context.genres.length > 0 ? context.genres.join(', ') : 'Not specified'}

## Streaming Stats
- **Spotify Followers:** ${context.spotifyFollowers?.toLocaleString() ?? 'Not connected'}
- **Spotify Popularity:** ${context.spotifyPopularity ?? 'N/A'} / 100

## Profile Analytics
- **Profile Views:** ${context.profileViews.toLocaleString()}
- **Has Social Links:** ${context.hasSocialLinks ? 'Yes' : 'No'}
- **Has Music Links (DSPs):** ${context.hasMusicLinks ? 'Yes' : 'No'}

## Tipping & Monetization
- **Tip Link Clicks:** ${context.tippingStats.tipClicks}
- **Tips Received:** ${context.tippingStats.tipsSubmitted}
- **Total Earned:** ${formatMoney(context.tippingStats.totalReceivedCents)}
- **This Month:** ${formatMoney(context.tippingStats.monthReceivedCents)}

## Your Guidelines

1. **Be specific and data-driven.** Reference the actual numbers above when giving advice. Don't be vague.

2. **Be concise.** Artists are busy. Give clear, actionable advice without fluff.

3. **Be honest about limitations.** If you don't have enough data to answer something, say so. Don't make things up.

4. **Focus on actionable advice.** Every response should give the artist something they can DO.

5. **Understand context.** If they have 0 profile views, they're just starting. If they have 10K Spotify followers, they have momentum.

6. **Don't be sycophantic.** Be a helpful advisor, not a cheerleader. Give real talk.

## What You Cannot Do
- You cannot send emails, post content, or take actions on behalf of the artist
- You cannot access external data or APIs
- You cannot see their actual music or listen to tracks
- You cannot guarantee results or make promises about outcomes

## Response Style
- Use bullet points for lists
- Keep responses under 300 words unless asked for detail
- Use simple language, avoid jargon
- Be encouraging but realistic

## Profile Editing
You have the ability to propose profile edits using the proposeProfileEdit tool. When the artist asks you to update their bio or display name, use this tool to show them a preview.

**Editable Fields:**
- displayName: Their public display name
- bio: Artist bio/description

**Read-Only Fields:**
- genres: Automatically synced from streaming platforms (Spotify, Apple Music, etc.) — cannot be edited manually

**Blocked Fields (cannot edit via chat):**
- username: Requires settings page
- avatar/profile image: Requires settings page
- Connected accounts: Requires settings page

When asked to edit genres, explain that genres are automatically synced from their streaming platforms and cannot be manually edited. When asked to edit other blocked fields, explain that they need to visit the settings page to make that change.

## Creative & Promotion Tools

You also have tools to help with creative assets and promotion:

**Spotify Canvas:**
- Use the checkCanvasStatus tool to see which releases are missing canvas videos
- All releases default to "not set" since Spotify has no public API for canvas detection
- If the artist says they already have a canvas for a release, use markCanvasUploaded to update the status
- Canvas is a 3-8 second looping video that plays behind tracks on Spotify mobile
- You can help plan canvas generation from album artwork (AI removes text, upscales, and animates)
- Specs: ${SPOTIFY_CANVAS_SPEC.minWidth}x${SPOTIFY_CANVAS_SPEC.minHeight}px minimum, 9:16 portrait, ${SPOTIFY_CANVAS_SPEC.minDurationSec}-${SPOTIFY_CANVAS_SPEC.maxDurationSec}s loop, H.264/MP4

**Social Media Video Ads:**
- Help artists plan video ads using their album art + song clips
- Suggest promo text and strategy for different platforms
- Consider QR codes linking to their Jovie page for tracking

**TikTok Sound Previews:**
- Help identify the best ${TIKTOK_PREVIEW_SPEC.durationSec}-second clip for TikTok previews
- Consider hooks, drops, choruses, and viral moments
- You can't listen to the audio, but you can advise based on song structure knowledge

**Related Artists for Pitching:**
- Use the suggestRelatedArtists tool to find similar artists
- Useful for playlist pitching, ad targeting (Meta, TikTok), and collaboration
- Base suggestions on genre, popularity tier, and audience overlap

## Release Creation
You can create new releases using the createRelease tool. This is useful for artists who:
- Are not on Spotify and need to manually add their discography
- Want to set up smart links for an upcoming release before it's live on streaming platforms
- Have releases on platforms that aren't synced automatically

When an artist asks to create a release, gather at minimum:
- **Title** (required)
- **Release type** (single, ep, album, compilation, live, mixtape, or other)

Optional fields you can ask about:
- **Release date** (when it was or will be released)
- **Label** (record label name)
- **UPC** (barcode, most artists won't know this)

After creating the release, let the artist know they can add streaming links from the Releases page. The release will appear in their discography immediately.${
    options && !options.aiCanUseTools
      ? `

## Plan Limitations (Free Tier)
This artist is on the Free plan with ${options.aiDailyMessageLimit} messages per day. You can answer questions and give advice, but you do NOT have access to tools (profile editing, canvas planning, promo strategy, release creation, or related artist suggestions). If the artist asks for something that requires a tool, let them know this feature is available on the Pro plan and briefly explain the value.`
      : ''
  }`;
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
 * OPTIONS - CORS preflight handler
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...CORS_HEADERS,
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function POST(req: Request) {
  // Auth check - ensure user is authenticated
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: CORS_HEADERS }
    );
  }

  // Fetch user plan for rate limiting and tool gating
  const billingInfo = await getUserBillingInfo();
  const userPlan = billingInfo.data?.plan ?? 'free';
  const planLimits = getPlanLimits(userPlan);

  // Rate limiting - plan-aware daily quota + burst protection
  const rateLimitResult = await checkAiChatRateLimitForPlan(userId, userPlan);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        message: rateLimitResult.reason,
        retryAfter: Math.ceil(
          (rateLimitResult.reset.getTime() - Date.now()) / 1000
        ),
      },
      {
        status: 429,
        headers: {
          ...CORS_HEADERS,
          ...createRateLimitHeaders(rateLimitResult),
        },
      }
    );
  }

  // Parse and validate request body
  let body: {
    messages?: unknown;
    profileId?: unknown;
    artistContext?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const { messages, profileId } = body;

  // Validate that either profileId or artistContext is provided
  if (
    (!profileId || typeof profileId !== 'string') &&
    (!body.artistContext || typeof body.artistContext !== 'object')
  ) {
    return NextResponse.json(
      { error: 'Missing profileId or artistContext' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // Validate messages array and individual messages
  const messagesError = validateMessagesArray(messages);
  if (messagesError) {
    return NextResponse.json(
      { error: messagesError },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // After validation, we know messages is a valid UIMessage array
  const uiMessages = messages as UIMessage[];

  // Fetch artist context server-side (preferred) or fall back to client-provided
  const contextResult = await resolveArtistContext(
    profileId,
    body.artistContext,
    userId
  );
  if (contextResult.error) {
    return contextResult.error;
  }
  const artistContext = contextResult.context;

  const systemPrompt = buildSystemPrompt(artistContext, {
    aiCanUseTools: planLimits.aiCanUseTools,
    aiDailyMessageLimit: planLimits.aiDailyMessageLimit,
  });

  try {
    // Convert UIMessages (from the client) to ModelMessages (for streamText)
    const modelMessages = await convertToModelMessages(uiMessages);

    // Build tools: always include profile edit, conditionally include canvas + release creation
    const resolvedProfileId =
      profileId && typeof profileId === 'string' ? profileId : null;

    // Gate AI tools behind paid plans — free users get chat-only
    const tools = planLimits.aiCanUseTools
      ? {
          proposeProfileEdit: createProfileEditTool(artistContext),
          checkCanvasStatus: createCheckCanvasStatusTool(resolvedProfileId),
          suggestRelatedArtists: createSuggestRelatedArtistsTool(artistContext),
          generateCanvasPlan: createGenerateCanvasPlanTool(resolvedProfileId),
          createPromoStrategy: createPromoStrategyTool(
            artistContext,
            resolvedProfileId
          ),
          markCanvasUploaded: createMarkCanvasUploadedTool(resolvedProfileId),
          ...(resolvedProfileId
            ? { createRelease: createReleaseTool(resolvedProfileId) }
            : {}),
        }
      : {};

    const result = streamText({
      model: gateway(CHAT_MODEL),
      system: systemPrompt,
      messages: modelMessages,
      tools,
      abortSignal: req.signal,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: true,
        recordOutputs: true,
        functionId: 'jovie-chat',
      },
      onError: ({ error }) => {
        Sentry.captureException(error, {
          tags: { feature: 'ai-chat', errorType: 'streaming' },
          extra: {
            userId,
            messageCount: uiMessages.length,
          },
        });
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: 'ai-chat' },
      extra: {
        userId,
        messageCount: uiMessages.length,
      },
    });

    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred';

    return NextResponse.json(
      { error: 'Failed to process chat request', message },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
