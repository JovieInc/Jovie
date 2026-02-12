import { tool } from 'ai';
import { z } from 'zod';
import { type ArtistContext, FIELD_DESCRIPTIONS } from '../helpers';

/**
 * Creates the proposeProfileEdit tool for the AI to suggest profile changes.
 * This tool only returns a preview - actual changes require user confirmation.
 */
export function createProfileEditTool(context: ArtistContext) {
  const profileEditSchema = z.object({
    field: z
      .enum(['displayName', 'bio', 'genres'])
      .describe('The profile field to edit'),
    newValue: z
      .union([z.string(), z.array(z.string())])
      .describe(
        'The new value for the field. For genres, pass an array of strings.'
      ),
    reason: z
      .string()
      .optional()
      .describe('Brief explanation of why this change was suggested'),
  });

  return tool({
    description:
      'Propose a profile edit for the artist. Returns a preview that the user must confirm before it takes effect. Use this when the artist asks to update their display name, bio, or genres.',
    inputSchema: profileEditSchema,
    execute: async ({ field, newValue, reason }) => {
      // Validate the new value type matches the field
      const isGenres = field === 'genres';
      if (isGenres && !Array.isArray(newValue)) {
        return { success: false, error: 'Genres must be an array of strings' };
      }
      if (!isGenres && typeof newValue !== 'string') {
        return { success: false, error: `${field} must be a string` };
      }

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
