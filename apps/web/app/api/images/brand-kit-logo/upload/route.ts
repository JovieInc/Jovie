import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import {
  getVercelBlobUploader,
  uploadBufferToBlob,
} from '@/app/api/images/upload/lib';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';

export const runtime = 'nodejs';

const ALLOWED_TYPES = new Set(['image/png', 'image/svg+xml']);
const MAX_FILE_SIZE = 2 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const { userId: clerkUserId } = await getCachedAuth();
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const profileId = request.nextUrl.searchParams.get('profileId');
  if (!profileId) {
    return NextResponse.json(
      { error: 'Profile ID is required' },
      { status: 400 }
    );
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'Logo file is required' },
      { status: 400 }
    );
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: 'Logo must be a PNG or SVG file' },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: 'Logo file must be 2MB or smaller' },
      { status: 400 }
    );
  }

  const [profile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(
      and(eq(creatorProfiles.id, profileId), eq(users.clerkId, clerkUserId))
    )
    .limit(1);

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const extension = file.type === 'image/png' ? 'png' : 'svg';
  const buffer = Buffer.from(await file.arrayBuffer());
  const put = await getVercelBlobUploader();
  const logoUrl = await uploadBufferToBlob(
    put,
    `album-art/logos/profiles/${profileId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`,
    buffer,
    file.type
  );

  return NextResponse.json({ logoUrl }, { status: 200 });
}
