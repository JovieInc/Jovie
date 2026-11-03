import { tool } from 'ai';
import { z } from 'zod';
import { chatToolSchema } from '@/lib/chat/strict-schema';
import { createReleaseForProfile } from '@/lib/domain/releases';

/**
 * The chat `createRelease` tool. It owns the schema the model sees and nothing
 * else: the write is `createReleaseForProfile`, the same function the Releases
 * form action calls, so a release made in chat is stored exactly like one made
 * in the form.
 */
export function createReleaseTool(profileId: string, userId: string) {
  const createReleaseSchema = chatToolSchema({
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
    genres: z
      .array(z.string().max(60))
      .max(3)
      .optional()
      .describe('Up to three genres, if the artist named them'),
    isExplicit: z
      .boolean()
      .optional()
      .describe('Whether the release is explicit, if the artist said so'),
  });

  return tool({
    description:
      "Create a new release in the artist's discography. Use this when the artist wants to add a release that isn't synced from Spotify — for example, a new single, EP, or album they want to set up smart links for. Ask for the title and release type at minimum before calling this tool.",
    inputSchema: createReleaseSchema,
    execute: async ({
      title,
      releaseType,
      releaseDate,
      label,
      upc,
      genres,
      isExplicit,
    }) => {
      const result = await createReleaseForProfile({
        userId,
        profileId,
        title,
        releaseType,
        releaseDate,
        label,
        upc,
        genres,
        isExplicit,
      });
      if (!result.ok) return { success: false, error: result.message };
      const { release } = result;
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
    },
  });
}
