/**
 * Extracted tool schemas for the Jovie AI chat.
 *
 * EVAL ONLY — never import execute functions here. Tool schemas only.
 * These schemas are shared between the production chat route and the eval runner.
 * The route attaches execute closures; the eval runner uses no-op stubs.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema definitions (descriptions + Zod input schemas)
// ---------------------------------------------------------------------------

export const TOOL_SCHEMAS = {
  proposeAvatarUpload: {
    description:
      'Show a profile photo upload widget in the chat. Use this when the artist wants to change, update, or set their profile photo. Do not describe how to upload — just call this tool.',
    inputSchema: z.object({}),
  },
  generateAlbumArt: {
    description:
      'Generate three album art options for a release. Use when the artist asks to generate album artwork or cover art.',
    inputSchema: z.object({
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

  proposeSocialLink: {
    description:
      'Propose adding a social link to the artist profile. Pass the full URL. The client will show a confirmation card with the detected platform. Use this when the artist asks to add a link or social profile URL.',
    inputSchema: z.object({
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
    inputSchema: z.object({
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
    inputSchema: z.object({
      message: z
        .string()
        .min(5)
        .max(2000)
        .describe('The feedback message from the artist'),
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
