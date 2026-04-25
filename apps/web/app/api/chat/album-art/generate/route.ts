import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOwnedChatProfile } from '@/lib/chat/profile-ownership';
import { captureError } from '@/lib/error-tracking';
import {
  AlbumArtConfigurationError,
  generateAlbumArtForChat,
} from '@/lib/services/album-art/generate';
import { logger } from '@/lib/utils/logger';
import { parseAlbumArtRequestBody, requireAlbumArtUser } from '../shared';

export const runtime = 'nodejs';
export const maxDuration = 120;

const generateAlbumArtSchema = z.object({
  profileId: z.string().uuid(),
  releaseTitle: z.string().max(200).optional(),
  releaseId: z.string().uuid().optional(),
  styleId: z
    .enum(['neo_pop_collage', 'chrome_noir', 'analog_dream', 'minimal_icon'])
    .optional(),
  prompt: z.string().max(500).optional(),
  createRelease: z.boolean().optional(),
});

export async function POST(req: Request) {
  const auth = await requireAlbumArtUser();
  if (!auth.ok) {
    return auth.response;
  }

  const parsed = await parseAlbumArtRequestBody(req, generateAlbumArtSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  const profile = await getOwnedChatProfile({
    profileId: parsed.data.profileId,
    clerkUserId: auth.userId,
  });
  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  try {
    const result = await generateAlbumArtForChat({
      ...parsed.data,
      clerkUserId: auth.userId,
      artistName: profile.displayName ?? profile.username ?? 'Artist',
    });
    return NextResponse.json(result);
  } catch (error) {
    captureError('[album-art] Failed to generate artwork', error, {
      userId: auth.userId,
      profileId: parsed.data.profileId,
      releaseId: parsed.data.releaseId,
      releaseTitle: parsed.data.releaseTitle,
    });
    logger.error('[album-art] Failed to generate artwork', {
      userId: auth.userId,
      profileId: parsed.data.profileId,
      releaseId: parsed.data.releaseId,
      releaseTitle: parsed.data.releaseTitle,
      error,
    });
    const status = error instanceof AlbumArtConfigurationError ? 503 : 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate album art',
      },
      { status }
    );
  }
}
