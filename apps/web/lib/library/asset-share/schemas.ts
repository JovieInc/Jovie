import { z } from 'zod';

export const libraryAssetShareMutationSchema = z.object({
  profileId: z.string().uuid(),
  assetId: z.string().min(1),
  itemKind: z.enum(['release', 'merch', 'image', 'video', 'audio']),
  title: z.string().min(1),
  smartLinkPath: z.string().optional(),
});

export const libraryAssetShareVisibilitySchema =
  libraryAssetShareMutationSchema.extend({
    visibility: z.enum(['public', 'private']),
  });

export type LibraryAssetShareMutationInput = z.infer<
  typeof libraryAssetShareMutationSchema
>;
