import { and, sql as drizzleSql, eq, inArray } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { creatorProfiles, waitlistInvites } from '@/lib/db/schema';
import { sendNotification } from '@/lib/notifications/service';
import { buildWaitlistInviteEmail } from '@/lib/waitlist/invite';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const CRON_SECRET = process.env.CRON_SECRET;

function isAuthorized(request: NextRequest): boolean {
  if (!CRON_SECRET) {
    return false;
  }

  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${CRON_SECRET}`;
}

const sendWindowSchema = z.object({
  sendWindowEnabled: z.boolean().default(true),
  maxPerRun: z.number().int().min(1).max(100).default(10),
  maxPerHour: z.number().int().min(1).max(1000).default(50),
});

function isWithinPacificSendWindow(now: Date): boolean {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const weekday = parts.find(p => p.type === 'weekday')?.value ?? '';
  const hourRaw = parts.find(p => p.type === 'hour')?.value ?? '';
  const hour = Number.parseInt(hourRaw, 10);

  const isWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday);
  if (!isWeekday) return false;

  // 9am–5pm PT (17:00 exclusive)
  return hour >= 9 && hour < 17;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const now = new Date();

  const body = await request.json().catch(() => ({}));
  const parsed = sendWindowSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const { sendWindowEnabled, maxPerRun, maxPerHour } = parsed.data;

  if (sendWindowEnabled && !isWithinPacificSendWindow(now)) {
    return NextResponse.json(
      { ok: true, attempted: 0, sent: 0, skipped: 'outside_send_window' },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  }

  // Throttle: only allow maxPerHour successful sends in trailing hour
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const [{ count: sentLastHour }] = await db
    .select({ count: drizzleSql<number>`count(*)::int` })
    .from(waitlistInvites)
    .where(
      and(
        eq(waitlistInvites.status, 'sent'),
        drizzleSql`${waitlistInvites.sentAt} >= ${oneHourAgo}`
      )
    );

  const remainingThisHour = Math.max(0, maxPerHour - (sentLastHour ?? 0));
  const limit = Math.min(maxPerRun, remainingThisHour);

  if (limit <= 0) {
    return NextResponse.json(
      { ok: true, attempted: 0, sent: 0, skipped: 'hourly_cap_reached' },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  }

  // Claim pending invites with row-level locking, similar to ingestion job runner.
  const claimedRows = await db.transaction(async tx => {
    const candidateResult = await tx.execute(
      drizzleSql`
        select
          id,
          waitlist_entry_id as "waitlistEntryId",
          creator_profile_id as "creatorProfileId",
          email,
          full_name as "fullName",
          claim_token as "claimToken",
          status,
          error,
          attempts,
          max_attempts as "maxAttempts",
          run_at as "runAt",
          sent_at as "sentAt",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from waitlist_invites
        where status = 'pending'
          and run_at <= ${now}
          and attempts < max_attempts
        order by run_at asc
        limit ${limit}
        for update skip locked
      `
    );

    const candidates = candidateResult.rows as Array<{
      id: string;
      waitlistEntryId: string;
      creatorProfileId: string;
      email: string;
      fullName: string;
      claimToken: string;
      status: 'pending' | 'sending' | 'sent' | 'failed';
      error: string | null;
      attempts: number;
      maxAttempts: number;
      runAt: Date;
      sentAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }>;

    const ids = candidates.map(row => row.id);

    if (ids.length === 0) {
      return [];
    }

    await tx
      .update(waitlistInvites)
      .set({ status: 'sending', updatedAt: new Date() })
      .where(inArray(waitlistInvites.id, ids));

    return candidates;
  });

  const attempted = claimedRows.length;
  let sent = 0;

  for (const invite of claimedRows) {
    try {
      const [profile] = await db
        .select({ claimToken: creatorProfiles.claimToken })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.id, invite.creatorProfileId))
        .limit(1);

      const claimToken = profile?.claimToken ?? invite.claimToken;

      const { message, target } = buildWaitlistInviteEmail({
        email: invite.email,
        fullName: invite.fullName,
        claimToken,
        dedupKey: `waitlist_invite:${invite.id}`,
      });

      const result = await sendNotification(message, target);

      const hadErrors = result.errors.length > 0;

      if (hadErrors) {
        const errorText = result.errors
          .map(e => e.error ?? e.detail)
          .join('; ');
        const [row] = await db
          .select({
            attempts: waitlistInvites.attempts,
            maxAttempts: waitlistInvites.maxAttempts,
          })
          .from(waitlistInvites)
          .where(eq(waitlistInvites.id, invite.id))
          .limit(1);

        const nextAttempts = (row?.attempts ?? invite.attempts ?? 0) + 1;
        const maxAttemptsResolved = row?.maxAttempts ?? invite.maxAttempts ?? 3;

        if (nextAttempts >= maxAttemptsResolved) {
          await db
            .update(waitlistInvites)
            .set({
              status: 'failed',
              attempts: nextAttempts,
              error: errorText || 'Notification send failed',
              updatedAt: new Date(),
            })
            .where(eq(waitlistInvites.id, invite.id));
          continue;
        }

        await db
          .update(waitlistInvites)
          .set({
            status: 'pending',
            attempts: nextAttempts,
            error: errorText || 'Notification send failed',
            runAt: new Date(Date.now() + 5 * 60 * 1000),
            updatedAt: new Date(),
          })
          .where(eq(waitlistInvites.id, invite.id));
        continue;
      }

      sent += 1;

      await db
        .update(waitlistInvites)
        .set({
          status: 'sent',
          sentAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(waitlistInvites.id, invite.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      // If attempts exceeded, mark failed; otherwise retry later.
      const [row] = await db
        .select({
          attempts: waitlistInvites.attempts,
          maxAttempts: waitlistInvites.maxAttempts,
        })
        .from(waitlistInvites)
        .where(eq(waitlistInvites.id, invite.id))
        .limit(1);

      const nextAttempts = (row?.attempts ?? invite.attempts ?? 0) + 1;
      const maxAttemptsResolved = row?.maxAttempts ?? invite.maxAttempts ?? 3;

      if (nextAttempts >= maxAttemptsResolved) {
        await db
          .update(waitlistInvites)
          .set({
            status: 'failed',
            attempts: nextAttempts,
            error: message,
            updatedAt: new Date(),
          })
          .where(eq(waitlistInvites.id, invite.id));
        continue;
      }

      await db
        .update(waitlistInvites)
        .set({
          status: 'pending',
          attempts: nextAttempts,
          error: message,
          runAt: new Date(Date.now() + 5 * 60 * 1000),
          updatedAt: new Date(),
        })
        .where(eq(waitlistInvites.id, invite.id));
    }
  }

  return NextResponse.json(
    { ok: true, attempted, sent },
    { status: 200, headers: NO_STORE_HEADERS }
  );
}
