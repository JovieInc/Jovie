/**
 * Dashboard Earnings API - GET
 *
 * Returns tip statistics and recent tippers for the authenticated user's
 * selected creator profile. Data comes from the tips table (populated by
 * Stripe webhook handlers).
 */

import { and, count, desc, eq, sum } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { withDbSessionTx } from '@/lib/auth/session';
import { tips } from '@/lib/db/schema/analytics';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import type { EarningsResponse } from '@/lib/queries/useEarningsQuery';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return await withDbSessionTx(async (tx, clerkUserId) => {
      // Look up the user's selected profile
      const [user] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.clerkId, clerkUserId))
        .limit(1);

      if (!user) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      // Get the first creator profile for this user
      const [profile] = await tx
        .select({ id: creatorProfiles.id })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.userId, user.id))
        .limit(1);

      if (!profile) {
        return NextResponse.json(
          { error: 'Creator profile not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      // Fetch aggregated stats for completed tips
      const [statsRow] = await tx
        .select({
          totalRevenueCents: sum(tips.amountCents),
          totalTips: count(),
        })
        .from(tips)
        .where(
          and(
            eq(tips.creatorProfileId, profile.id),
            eq(tips.status, 'completed')
          )
        );

      const totalRevenueCents = Number(statsRow?.totalRevenueCents ?? 0);
      const totalTips = Number(statsRow?.totalTips ?? 0);
      const averageTipCents =
        totalTips > 0 ? Math.round(totalRevenueCents / totalTips) : 0;

      // Fetch recent tippers (most recent 50)
      const tippers = await tx
        .select({
          id: tips.id,
          tipperName: tips.tipperName,
          contactEmail: tips.contactEmail,
          amountCents: tips.amountCents,
          createdAt: tips.createdAt,
        })
        .from(tips)
        .where(
          and(
            eq(tips.creatorProfileId, profile.id),
            eq(tips.status, 'completed')
          )
        )
        .orderBy(desc(tips.createdAt))
        .limit(50);

      const response: EarningsResponse = {
        stats: {
          totalRevenueCents,
          totalTips,
          averageTipCents,
        },
        tippers: tippers.map(t => ({
          id: t.id,
          tipperName: t.tipperName,
          contactEmail: t.contactEmail,
          amountCents: t.amountCents,
          createdAt: t.createdAt.toISOString(),
        })),
      };

      return NextResponse.json(response, { headers: NO_STORE_HEADERS });
    });
  } catch (error) {
    captureError('Failed to fetch earnings data', error, {
      route: '/api/dashboard/earnings',
    });
    return NextResponse.json(
      { error: 'Failed to fetch earnings data' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
