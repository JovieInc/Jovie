import { tool } from 'ai';
import { z } from 'zod';

/**
 * Editable profile fields by tier:
 * - Tier 1 (Safe): Non-destructive fields that can be freely edited
 * - Tier 2 (Careful): Fields that need confirmation before applying
 * - Tier 3 (Blocked): Cannot be edited via chat - requires settings page
 */
export const EDITABLE_FIELDS = {
  tier1: ['displayName', 'bio'] as const,
  tier2: [] as const,
  blocked: ['username', 'spotifyId', 'genres'] as const,
};

export type EditableField = (typeof EDITABLE_FIELDS.tier1)[number];

export const FIELD_DESCRIPTIONS: Record<EditableField, string> = {
  displayName: 'Display name shown on your profile',
  bio: 'Artist bio/description',
};

/** Minimal context shape needed by the profile edit tool. */
export interface ProfileEditContext {
  readonly displayName: string;
  readonly bio: string | null;
}

/**
 * Creates the proposeProfileEdit tool for the AI to suggest profile changes.
 * This tool only returns a preview - actual changes require user confirmation.
 */
export function createProfileEditTool(context: ProfileEditContext) {
  const profileEditSchema = z.object({
    field: z.enum(['displayName', 'bio']).describe('The profile field to edit'),
    newValue: z.string().describe('The new value for the field.'),
    reason: z
      .string()
      .optional()
      .describe('Brief explanation of why this change was suggested'),
    sourceUrl: z
      .string()
      .url()
      .optional()
      .describe(
        'Provenance: the public URL the value was imported from, when applicable. Set this when the value came from importBioFromUrl so the confirmation card can show "imported from {host}".'
      ),
    sourceTitle: z
      .string()
      .max(200)
      .optional()
      .describe(
        'Provenance: the page title of the source URL, when known. Display only.'
      ),
  });

  return tool({
    description:
      'Propose a profile edit for the artist. Returns a preview that the user must confirm before it takes effect. Use this when the artist asks to update their display name or bio. If the value came from importBioFromUrl, pass sourceUrl (and sourceTitle if available) so the confirmation card can show provenance.',
    inputSchema: profileEditSchema,
    execute: async ({ field, newValue, reason, sourceUrl, sourceTitle }) => {
      // Return preview data for the UI to render
      return {
        success: true,
        preview: {
          field,
          fieldLabel: FIELD_DESCRIPTIONS[field],
          currentValue: context[field],
          newValue,
          reason,
          sourceUrl,
          sourceTitle,
        },
      };
    },
  });
}
