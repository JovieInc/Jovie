import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getExactProfileAccess } from '@/lib/auth/profile-access';
import { withDbSessionTx } from '@/lib/auth/session';
import { listEmailSubscriberExportCandidates } from '@/lib/db/queries/analytics';
import {
  categorySubscriptions,
  emailSuppressions,
} from '@/lib/db/schema/suppression';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { buildSubscriberExportRows } from '@/lib/notifications/subscriber-export';
import { hashEmail } from '@/lib/notifications/suppression';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * There is intentionally no GET here. A browse endpoint returned raw email,
 * phone and name for every subscriber, including people who never shared with
 * the artist (Level 1), and leaked identifiers through its cursor. The
 * Audience table reads gated rows via server data and the members API; the
 * only contact export is the consent-gated POST below.
 */

const exportRequestSchema = z
  .object({
    profileId: z.string().uuid(),
    selectedIds: z.array(z.string().uuid()).min(1).max(1000).optional(),
  })
  .strict();

/** Revalidate owner, paid capability and consent when preparing an email export. */
export async function POST(request: Request) {
  try {
    const entitlements = await getCurrentUserEntitlements({ session: 'fresh' });
    if (!entitlements.isAuthenticated || !entitlements.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    if (entitlements.billingVerification !== 'verified') {
      return NextResponse.json(
        { error: 'Billing could not be verified. Please try again.' },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }
    if (!entitlements.canExportContacts) {
      return NextResponse.json(
        { error: 'Export requires a paid entitlement.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }
    const input = exportRequestSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!input.success) {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    const { profileId, selectedIds } = input.data;
    const now = new Date();
    return await withDbSessionTx(
      async (tx, appUserId) => {
        if (entitlements.userId !== appUserId) {
          return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401, headers: NO_STORE_HEADERS }
          );
        }
        const access = await getExactProfileAccess(tx, appUserId, profileId);
        if (!access.ok || access.ownerUserId !== appUserId) {
          return NextResponse.json(
            { error: 'Profile is not available for export.' },
            { status: 403, headers: NO_STORE_HEADERS }
          );
        }
        const rows = await listEmailSubscriberExportCandidates(
          tx,
          profileId,
          selectedIds
        );
        if (rows.length > 10000) {
          return NextResponse.json(
            { error: 'Select fewer subscribers to export.' },
            { status: 413, headers: NO_STORE_HEADERS }
          );
        }
        const emailByHash = new Map(
          rows.flatMap(row =>
            row.email
              ? [
                  [
                    hashEmail(row.email),
                    row.email.trim().toLowerCase(),
                  ] as const,
                ]
              : []
          )
        );
        const hashes = [...emailByHash.keys()];
        const blockedEmails = new Set<string>();
        if (hashes.length) {
          const suppressions = await tx
            .select({ emailHash: emailSuppressions.emailHash })
            .from(emailSuppressions)
            .where(
              and(
                inArray(emailSuppressions.emailHash, hashes),
                or(
                  isNull(emailSuppressions.expiresAt),
                  gt(emailSuppressions.expiresAt, now)
                )
              )
            );
          const optOuts = await tx
            .select({ emailHash: categorySubscriptions.emailHash })
            .from(categorySubscriptions)
            .where(
              and(
                inArray(categorySubscriptions.emailHash, hashes),
                eq(categorySubscriptions.categoryKey, 'all_artists'),
                eq(categorySubscriptions.subscribed, false)
              )
            );
          for (const row of [...suppressions, ...optOuts]) {
            const email = emailByHash.get(row.emailHash);
            if (email) blockedEmails.add(email);
          }
        }
        return NextResponse.json(
          {
            rows: buildSubscriberExportRows(
              rows,
              blockedEmails,
              now,
              selectedIds ? new Set(selectedIds) : undefined
            ),
          },
          { headers: NO_STORE_HEADERS }
        );
      },
      { clerkUserId: entitlements.userId }
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    logger.error('Subscriber export failed', error);
    await captureError('Subscriber export failed', error, {
      route: '/api/dashboard/audience/subscribers',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Unable to export subscribers. Please try again.' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
