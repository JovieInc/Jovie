import { NextResponse } from 'next/server';
import { getCurrentUserProfile } from '@/lib/auth/session';
import {
  getCanvasGeneration,
  getOwnedReleaseCanvasContext,
} from '@/lib/services/canvas/service';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ generationId: string }> }
) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { generationId } = await params;
  const generation = await getCanvasGeneration({ generationId });
  if (!generation) {
    return NextResponse.json(
      { error: 'Generation not found' },
      { status: 404 }
    );
  }

  try {
    await getOwnedReleaseCanvasContext({
      creatorProfileId: profile.id,
      releaseId: generation.releaseId,
    });
  } catch {
    return NextResponse.json(
      { error: 'Generation not found' },
      { status: 404 }
    );
  }

  return NextResponse.json(generation);
}
