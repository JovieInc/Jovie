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
