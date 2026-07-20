/**
 * Extracted tool schemas for the Jovie AI chat.
 *
 * EVAL ONLY — never import execute functions here. Tool schemas only.
 * These schemas are shared between the production chat route and the eval runner.
 * The route attaches execute closures; the eval runner uses no-op stubs.
 */

import { z } from 'zod';
import {
  PITCH_PLATFORMS,
  PITCH_TARGET_OPTIONS_TEXT,
  PITCH_TARGETS,
} from '@/lib/services/pitch/targets';
import { chatToolSchema } from './strict-schema';
import { interviewSignalSchema } from './tools/onboarding-signals';

// ---------------------------------------------------------------------------
// Schema definitions (descriptions + Zod input schemas)
// ---------------------------------------------------------------------------

export const TOOL_SCHEMAS = {
  proposeAvatarUpload: {
    description:
      'Show a profile photo upload widget in the chat. Use this when the artist wants to change, update, or set their profile photo. Do not describe how to upload — just call this tool.',
    inputSchema: chatToolSchema({}),
  },
  generateAlbumArt: {
    description:
      'Generate three album art options for a release. Use when the artist asks to generate album artwork or cover art.',
    inputSchema: chatToolSchema({
      releaseTitle: z.string().max(200).optional(),
      releaseId: z.string().uuid().optional(),
      styleId: z
        .enum([
          'neo_pop_collage',
          'chrome_noir',
          'analog_dream',
          'minimal_icon',
        ])
        .optional(),
      prompt: z.string().max(500).optional(),
      createRelease: z.boolean().optional(),
    }),
  },

  retouchImage: {
    description:
      'Retouch an attached or referenced artist photo using the White Space editorial style.',
    inputSchema: chatToolSchema({
      styleId: z.enum(['white-space']).optional(),
      instructions: z.string().max(500).optional(),
    }),
  },

  generateReleasePitch: {
    description: `Generate one copy-paste-ready release pitch for a destination. Ask where they want to pitch it before using this tool unless the task or user message clearly maps to: ${PITCH_TARGET_OPTIONS_TEXT}.`,
    inputSchema: chatToolSchema({
      releaseTitle: z.string().max(200).optional(),
      releaseId: z.string().uuid().optional(),
      target: z.enum(PITCH_TARGETS).optional(),
      platform: z.enum(PITCH_PLATFORMS).optional(),
      taskTitle: z.string().max(200).optional(),
      taskCategory: z.string().max(100).optional(),
      instructions: z.string().max(700).optional(),
    }),
  },

  createMerch: {
    description:
      'Generate exactly three premium merch options for the artist. Use when the artist asks to make merch, create a tee/hoodie/item, or make something that would sell.',
    inputSchema: chatToolSchema({
      prompt: z.string().max(500).optional(),
      itemType: z.string().max(80).optional(),
      makeLive: z.boolean().optional(),
    }),
  },

  previewMerchOptions: {
    description:
      'Preview three merch design options without publishing them. Use when the artist asks for concepts or wants to see merch ideas first.',
    inputSchema: chatToolSchema({
      prompt: z.string().max(500).optional(),
      itemType: z.string().max(80).optional(),
    }),
  },

  selectMerchDesign: {
    description:
      'Select one of the three merch options from a previous merch generation. Use after the artist picks option 1, 2, or 3.',
    inputSchema: chatToolSchema({
      generationId: z.string().uuid(),
      optionNumber: z.number().int().min(1).max(3).optional(),
      optionId: z.string().uuid().optional(),
      makeLive: z.boolean().optional(),
    }).refine(data => data.optionNumber !== undefined || data.optionId, {
      message: 'Provide either optionNumber or optionId.',
      path: ['optionNumber'],
    }),
  },

  createMerchAlternativeItem: {
    description:
      'Create a new merch card that keeps an existing card design but moves it onto a different Printful product. Use when the artist asks for the same design on another item, like a hoodie, hat, tank, or a specific Printful catalog product ID.',
    inputSchema: chatToolSchema({
      merchCardId: z.string().uuid(),
      itemType: z
        .string()
        .min(2)
        .max(120)
        .describe(
          'Target product type or Printful catalog product ID, for example "hoodie", "hat", or "catalog product 71".'
        ),
    }),
  },

  publishMerchCard: {
    description:
      'Propose publishing an existing merch card to the public artist profile. Returns a confirmation card; does not publish until the artist confirms.',
    inputSchema: chatToolSchema({
      merchCardId: z.string().uuid(),
    }),
  },

  pauseMerchCard: {
    description:
      'Propose pausing a live merch card so fans can no longer buy it. Returns a confirmation card with consequence text; does not pause until the artist confirms.',
    inputSchema: chatToolSchema({
      merchCardId: z.string().uuid(),
    }),
  },

  unpauseMerchCard: {
    description:
      'Propose making a paused merch card live again. Returns a confirmation card; does not unpause until the artist confirms.',
    inputSchema: chatToolSchema({
      merchCardId: z.string().uuid(),
    }),
  },

  deleteOrArchiveMerchCard: {
    description:
      'Propose archiving a merch card. Returns a confirmation card; does not archive until the artist confirms.',
    inputSchema: chatToolSchema({
      merchCardId: z.string().uuid(),
    }),
  },

  reorderMerchCards: {
    description:
      'Reorder merch cards on the artist profile. Use when the artist asks to rank, pin, or move merch cards.',
    inputSchema: chatToolSchema({
      merchCardIds: z.array(z.string().uuid()).min(1).max(12),
    }),
  },

  optimizeMerchCards: {
    description:
      'Optimize merch card ranking using sales, margin, clicks, recency, and availability.',
    inputSchema: chatToolSchema({}),
  },

  showMerchSales: {
    description: 'Show merch revenue and purchase counts for this artist.',
    inputSchema: chatToolSchema({}),
  },

  showArtistPayouts: {
    description:
      'Show internal artist payout liability for merch. Do not imply automatic payout in MVP.',
    inputSchema: chatToolSchema({}),
  },

  showAccountStatus: {
    description:
      'Show authenticated account plan, billing verification, feature access, merch access, and safe next action.',
    inputSchema: chatToolSchema({}),
  },

  showUsage: {
    description:
      'Show AI chat usage, daily/monthly limits, remaining messages, and reset time for the authenticated account.',
    inputSchema: chatToolSchema({}),
  },

  openBillingPortal: {
    description:
      'Open the Stripe billing portal when available, or return billing settings when no billing account exists. Does not change the subscription.',
    inputSchema: chatToolSchema({}),
  },

  proposeSocialLink: {
    description:
      'Propose adding a social link to the artist profile. Pass the full URL. The client will show a confirmation card with the detected platform. Use this when the artist asks to add a link or social profile URL.',
    inputSchema: chatToolSchema({
      url: z
        .string()
        .describe(
          'The full URL to add (e.g. https://instagram.com/myhandle). Construct the full URL from handles if needed.'
        ),
    }),
  },

  proposeSocialLinkRemoval: {
    description:
      'Propose removing a social link from the artist profile. Use this when the artist asks to remove or delete a link. Returns a confirmation card with link details. You must specify the platform name (e.g. "instagram", "spotify", "twitter") to identify which link to remove.',
    inputSchema: chatToolSchema({
      platform: z
        .string()
        .describe(
          'The platform name of the link to remove (e.g. "instagram", "spotify", "twitter", "tiktok"). Case-insensitive.'
        ),
    }),
  },

  submitFeedback: {
    description:
      'Submit product feedback from the artist. Use this when the artist wants to share feedback, report a bug, or request a feature. Collect their feedback message first, then call this tool with the full text.',
    inputSchema: chatToolSchema({
      message: z
        .string()
        .min(5)
        .max(2000)
        .describe('The feedback message from the artist'),
    }),
  },

  // -------------------------------------------------------------------------
  // Onboarding tools (JOV-2132 PR 2) — available only in mode='onboarding'.
  // -------------------------------------------------------------------------

  searchSpotifyArtist: {
    description:
      'Open the Spotify artist picker popout in the chat. Use this on the FIRST turn the visitor mentions being a musician/artist, or whenever you need to identify which artist they are. The widget calls /api/spotify/search and renders suggestion cards; pass the query if the visitor has already named themselves, otherwise leave it empty to let them type.',
    inputSchema: chatToolSchema({
      query: z
        .string()
        .max(200)
        .optional()
        .describe('Pre-fill search query (artist name or shorthand)'),
    }),
  },

  confirmSpotifyArtist: {
    description:
      'Lock in the Spotify artist the visitor picked. This pulls Spotify enrichment (avatar, name, followers, popularity, genres) and is the trigger for the profile-preview reveal stage. Call this ONLY after the user has explicitly selected a candidate from searchSpotifyArtist results.',
    inputSchema: chatToolSchema({
      spotifyArtistId: z
        .string()
        .min(1)
        .max(64)
        .describe(
          'Spotify artist ID (alphanumeric, e.g. "4uA0L8H4DcXmKkJtGTQGzz")'
        ),
    }),
  },

  checkHandle: {
    description:
      'Check whether a Jovie handle (username) is available. Use after the visitor has been identified (Spotify pick or self-named) to claim their handle. The widget shows green-check / red-x with suggestions if taken. Pass the proposed handle without the @ prefix.',
    inputSchema: chatToolSchema({
      handle: z
        .string()
        .min(1)
        .max(30)
        .regex(
          /^[a-z0-9._-]+$/i,
          'Handle can only contain letters, numbers, dots, dashes, underscores'
        )
        .describe('Proposed handle (without @ prefix)'),
    }),
  },

  recordInterviewSignal: {
    description:
      'Silently record qualifying signal you learned this turn. Use whenever the visitor reveals their release stage, audience size band, what tool they currently use, or any objection / hesitation they raised. No UI surface — this is for analytics + later proposeNextStep scoring. Always pass at least one field; never call this with an empty signal.',
    inputSchema: interviewSignalSchema,
  },

  proposeNextStep: {
    description:
      'Decide whether to render the checkout card, the waitlist confirmation card, or continue the interview. Call this once you believe you have enough signal (typically after confirmSpotifyArtist + checkHandle, OR after 2+ interview turns). The server runs the deterministic evaluator — you do NOT score the decision, you trigger the evaluation.',
    inputSchema: chatToolSchema({}),
  },

  proposeCheckout: {
    description:
      'Render the checkout card. Only call this AFTER proposeNextStep returned instant_access. The card defaults to a route-handoff to /onboarding/checkout (Stripe Embedded Checkout iframe is behind a separate flag pending CSP verification).',
    inputSchema: chatToolSchema({
      plan: z
        .enum(['free', 'pro', 'max'])
        .optional()
        .describe('Plan intent. If omitted the user picks on the next screen.'),
    }),
  },
} as const;

// ---------------------------------------------------------------------------
// Free-tier tool set (schemas only, no execute functions)
// ---------------------------------------------------------------------------

export type ToolSchemaKey = keyof typeof TOOL_SCHEMAS;

export const FREE_TIER_TOOLS = [
  'proposeAvatarUpload',
  'proposeSocialLink',
  'proposeSocialLinkRemoval',
  'submitFeedback',
] as const satisfies readonly ToolSchemaKey[];

/**
 * Onboarding-mode tool set (JOV-2132 PR 2). These are the only tools exposed
 * to the LLM when `mode='onboarding'`. proposeSocialLink is reused from the
 * authenticated set; the rest are new.
 */
export const ONBOARDING_TOOLS = [
  'searchSpotifyArtist',
  'confirmSpotifyArtist',
  'checkHandle',
  'proposeSocialLink',
  'recordInterviewSignal',
  'proposeNextStep',
  'proposeCheckout',
] as const satisfies readonly ToolSchemaKey[];
