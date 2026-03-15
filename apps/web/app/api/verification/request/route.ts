import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { withDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { notifyVerificationRequest } from '@/lib/verification/notifications';

export const runtime = 'nodejs';

export async function POST() {
  try {
    return await withDbSession(async clerkUserId => {
      const [user] = await db
        .select({
          id: users.id,
          clerkId: users.clerkId,
          name: users.name,
          email: users.email,
          isPro: users.isPro,
        })
        .from(users)
        .where(and(eq(users.clerkId, clerkUserId), isNull(users.deletedAt)))
        .limit(1);

      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      if (!user.isPro) {
        return NextResponse.json(
          { error: 'Verification requests are available to Pro members.' },
          { status: 403 }
        );
      }

      const [profile] = await db
        .select({
          id: creatorProfiles.id,
          usernameNormalized: creatorProfiles.usernameNormalized,
          isVerified: creatorProfiles.isVerified,
        })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.userId, user.id))
        .limit(1);

      if (!profile) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404 }
        );
      }

      if (profile.isVerified) {
        return NextResponse.json(
          { error: 'Your profile is already verified.' },
          { status: 409 }
        );
      }

      const notificationResult = await notifyVerificationRequest({
        name: user.name?.trim() || user.email || user.clerkId,
        email: user.email,
        username: profile.usernameNormalized,
        profileId: profile.id,
      });

      if (notificationResult.status !== 'sent') {
        await captureError(
          'Verification request notification did not send',
          new Error(notificationResult.error ?? 'Slack notification skipped'),
          {
            route: '/api/verification/request',
            userId: user.id,
            profileId: profile.id,
            slackStatus: notificationResult.status,
            slackDetail: notificationResult.detail,
          }
        );

        return NextResponse.json(
          {
            error:
              'We could not notify our team about your verification request. Please try again in a moment.',
          },
          { status: 503 }
        );
      }

      return NextResponse.json({ success: true });
    });
  } catch (error) {
    const isUnauthorized =
      error instanceof Error && error.message === 'Unauthorized';

    if (!isUnauthorized) {
      await captureError('Verification request route failed', error, {
        route: '/api/verification/request',
      });
    }

    return NextResponse.json(
      {
        error: isUnauthorized
          ? 'Unauthorized'
          : 'Unable to submit verification request',
      },
      {
        status: isUnauthorized ? 401 : 500,
      }
    );
  }
}
