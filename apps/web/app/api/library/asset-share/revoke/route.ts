import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { runLibraryAssetShareMutation } from '@/lib/library/asset-share/route-helpers.server';
import { libraryAssetShareMutationSchema } from '@/lib/library/asset-share/schemas';
import { revokeLibraryAssetShareToken } from '@/lib/library/asset-share.server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const { userId: clerkUserId, error } = await requireAuth();
  if (error) return error;

  return runLibraryAssetShareMutation({
    request,
    clerkUserId,
    schema: libraryAssetShareMutationSchema,
    route: '/api/library/asset-share/revoke',
    captureMessage: 'Library asset share revoke failed',
    errorMessage: 'Failed to revoke asset share link',
    mutate: async (data, artistHandle) => {
      const { profileId, assetId, itemKind, title, smartLinkPath } = data;

      return revokeLibraryAssetShareToken({
        creatorProfileId: profileId,
        assetId,
        itemKind,
        title,
        smartLinkPath,
        artistHandle,
      });
    },
  });
}
