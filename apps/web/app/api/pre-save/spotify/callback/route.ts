import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { preSaveTokens } from '@/lib/db/schema/pre-save';
import { exchangeSpotifyCode, fetchSpotifyMe } from '@/lib/pre-save/spotify';
import { decodeSpotifyPreSaveState } from '@/lib/pre-save/state';
import { encryptPII } from '@/lib/utils/pii-encryption';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');

  if (!code || !stateParam) {
    return NextResponse.redirect(`${origin}/?preSave=error`, { status: 302 });
  }

  try {
    const state = decodeSpotifyPreSaveState(stateParam);
    const redirectUri = `${origin}/api/pre-save/spotify/callback`;
    const tokenResponse = await exchangeSpotifyCode({ code, redirectUri });
    const me = await fetchSpotifyMe(tokenResponse.access_token);
    const { userId: clerkId } = await auth();

    let dbUserId: string | null = null;
    if (clerkId) {
      const [dbUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.clerkId, clerkId))
        .limit(1);
      dbUserId = dbUser?.id ?? null;
    }

    const encryptedAccessToken = encryptPII(tokenResponse.access_token);
    const encryptedRefreshToken = tokenResponse.refresh_token
      ? encryptPII(tokenResponse.refresh_token)
      : null;

    await db
      .insert(preSaveTokens)
      .values({
        userId: dbUserId,
        releaseId: state.releaseId,
        trackId: state.trackId,
        provider: 'spotify',
        spotifyAccountId: me.id,
        encryptedAccessToken,
        encryptedRefreshToken,
        fanEmail: me.email ?? null,
      })
      .onConflictDoUpdate({
        target: [
          preSaveTokens.releaseId,
          preSaveTokens.provider,
          preSaveTokens.spotifyAccountId,
        ],
        set: {
          userId: dbUserId,
          trackId: state.trackId,
          encryptedAccessToken,
          encryptedRefreshToken,
          fanEmail: me.email ?? null,
          updatedAt: new Date(),
        },
      });

    const successUrl = `${origin}/${state.username}/${state.slug}?preSave=spotify-success`;
    return NextResponse.redirect(successUrl, { status: 302 });
  } catch {
    return NextResponse.redirect(`${origin}/?preSave=error`, { status: 302 });
  }
}
