import { tool } from 'ai';
import { z } from 'zod';
import { upsertRelease } from '@/lib/discography/queries';
import { generateUniqueSlug } from '@/lib/discography/slug';

/**
 * Creates the createRelease tool for the AI to add new releases to the artist's discography.
 * This tool directly creates the release in the database and returns the result.
 */
export function createReleaseTool(resolvedProfileId: string) {
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
