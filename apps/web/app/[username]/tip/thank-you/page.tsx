import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { checkGate, FEATURE_FLAG_KEYS } from '@/lib/feature-flags/server';
import { TipThankYouClient } from './TipThankYouClient';

interface Props {
  readonly params: Promise<{
    readonly username: string;
  }>;
  readonly searchParams?: Promise<{
    session_id?: string;
  }>;
}

/**
 * Tip thank-you page shown after Stripe checkout completes.
 *
 * Server component that resolves the creator profile and passes
 * data to the client component for retargeting pixel firing.
 */
export default async function TipThankYouPage({
  params,
  searchParams,
}: Readonly<Props>) {
  const { username } = await params;
  const resolvedSearchParams = await searchParams;
  const sessionId = resolvedSearchParams?.session_id ?? null;

  // Look up the creator profile
  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      displayName: creatorProfiles.displayName,
      username: creatorProfiles.username,
      isPublic: creatorProfiles.isPublic,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.usernameNormalized, username.toLowerCase()))
    .limit(1);

  if (!profile || !profile.isPublic) {
    notFound();
  }

  const retargetingEnabled = await checkGate(
    null,
    FEATURE_FLAG_KEYS.RETARGETING_PIXELS_TIP_PAGE,
    false
  );

  const artistName = profile.displayName || profile.username;

  return (
    <TipThankYouClient
      profileId={profile.id}
      artistName={artistName}
      handle={profile.username}
      sessionId={sessionId}
      retargetingEnabled={retargetingEnabled}
    />
  );
}
