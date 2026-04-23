#!/usr/bin/env tsx
/**
 * One-shot audit: find DB users whose `clerk_id` doesn't match any Clerk user
 * carrying that email. Fires a Sentry event per mismatch and exits non-zero
 * so CI can fail loudly if run on a schedule.
 *
 * Usage:
 *   doppler run -- pnpm --filter web tsx scripts/detect-clerk-id-drift.ts
 *
 * Respects Clerk rate limits by paginating the DB scan in batches and
 * backing off on 429 responses.
 */

import { createClerkClient } from '@clerk/backend';
import * as Sentry from '@sentry/nextjs';
import { asc, gt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';

const BATCH_SIZE = 50;
const CLERK_EMAIL_QUERY_LIMIT = 25;

interface Mismatch {
  dbUserId: string;
  email: string;
  storedClerkId: string;
  matchingClerkIds: string[];
}

async function lookupClerkIdsForEmail(
  clerk: ReturnType<typeof createClerkClient>,
  email: string
): Promise<string[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const list = await clerk.users.getUserList({
        emailAddress: [email],
        limit: CLERK_EMAIL_QUERY_LIMIT,
      });
      return list.data.map(u => u.id);
    } catch (error) {
      const status = (error as { status?: number })?.status;
      if (status === 429 && attempt < 2) {
        const waitMs = 2 ** attempt * 1_000;
        console.warn(
          `  rate limited on ${email}, backing off ${waitMs}ms (attempt ${attempt + 1})`
        );
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }
      throw error;
    }
  }
  throw new Error(`exhausted retries for ${email}`);
}

async function main() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    console.error(
      'CLERK_SECRET_KEY is required. Run under doppler (see script header).'
    );
    process.exit(2);
  }

  const clerk = createClerkClient({ secretKey });

  const mismatches: Mismatch[] = [];
  let cursorId = '';
  let totalScanned = 0;

  // Paginate through every user row using an id cursor so we don't hold
  // a transaction open for the full scan.
  for (;;) {
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        clerkId: users.clerkId,
      })
      .from(users)
      .where(cursorId ? gt(users.id, cursorId) : undefined)
      .orderBy(asc(users.id))
      .limit(BATCH_SIZE);

    if (rows.length === 0) break;

    for (const row of rows) {
      totalScanned += 1;
      if (!row.email || !row.clerkId) continue;

      const clerkIds = await lookupClerkIdsForEmail(clerk, row.email);
      if (clerkIds.length === 0) continue;
      if (clerkIds.includes(row.clerkId)) continue;

      const mismatch: Mismatch = {
        dbUserId: row.id,
        email: row.email,
        storedClerkId: row.clerkId,
        matchingClerkIds: clerkIds,
      };
      mismatches.push(mismatch);
      console.log(
        `  DRIFT: db=${row.id} email=${row.email} stored=${row.clerkId} clerk=${clerkIds.join(',')}`
      );

      Sentry.captureMessage('clerk_id_drift_detected', {
        level: 'warning',
        tags: {
          db_user_id: row.id,
          stored_clerk_id: row.clerkId,
        },
        extra: {
          matchingClerkIds: clerkIds,
        },
      });
    }

    const last = rows[rows.length - 1];
    if (!last) break;
    cursorId = last.id;
  }

  console.log(
    `\nscanned ${totalScanned} users, ${mismatches.length} clerk_id mismatches`
  );

  if (mismatches.length === 0) {
    console.log('clean');
    process.exit(0);
  }

  console.log(JSON.stringify(mismatches, null, 2));
  await Sentry.flush(2_000);
  process.exit(1);
}

main().catch(error => {
  console.error(error);
  process.exit(2);
});
