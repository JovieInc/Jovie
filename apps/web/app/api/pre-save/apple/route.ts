import { auth } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { providerLinks } from '@/lib/db/schema/content';
import { preSaveTokens } from '@/lib/db/schema/pre-save';
import { env } from '@/lib/env-server';
import { encryptPII } from '@/lib/utils/pii-encryption';

const applePreSaveSchema = z.object({
  releaseId: z.string().uuid(),
  trackId: z.string().uuid().nullable().optional(),
  appleMusicUserToken: z.string().min(20),
});

export async function POST(request: Request) {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = applePreSaveSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const [dbUser] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  if (!dbUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const [appleLink] = await db
    .select({ externalId: providerLinks.externalId })
    .from(providerLinks)
    .where(
      and(
        eq(providerLinks.providerId, 'apple_music'),
        eq(providerLinks.ownerType, parsed.data.trackId ? 'track' : 'release'),
        parsed.data.trackId
          ? eq(providerLinks.trackId, parsed.data.trackId)
          : eq(providerLinks.releaseId, parsed.data.releaseId)
      )
    )
    .limit(1);

  if (!appleLink?.externalId) {
    return NextResponse.json(
      { error: 'This release is not linked to Apple Music yet' },
      { status: 404 }
    );
  }

  if (env.APPLE_MUSIC_DEVELOPER_TOKEN) {
    const response = await fetch(
      `https://api.music.apple.com/v1/me/library?ids[albums]=${encodeURIComponent(appleLink.externalId)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.APPLE_MUSIC_DEVELOPER_TOKEN}`,
          'Music-User-Token': parsed.data.appleMusicUserToken,
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Apple Music pre-add failed' },
        { status: 502 }
      );
    }
  }

  await db.insert(preSaveTokens).values({
    userId: dbUser.id,
    releaseId: parsed.data.releaseId,
    trackId: parsed.data.trackId ?? null,
    provider: 'apple_music',
    fanEmail: dbUser.email ?? null,
    encryptedAppleMusicUserToken: encryptPII(parsed.data.appleMusicUserToken),
    executedAt: new Date(),
  });

  return NextResponse.json({ ok: true });
}
