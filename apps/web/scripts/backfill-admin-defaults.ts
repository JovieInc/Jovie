#!/usr/bin/env tsx

import { fileURLToPath } from 'node:url';
import { and, eq, isNull, ne, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';

const ADMIN_DEFAULT_PLAN = 'max';

export interface BackfillAdminDefaultsResult {
  readonly updatedCount: number;
  readonly updatedUserIds: string[];
}

export async function backfillAdminDefaults(): Promise<BackfillAdminDefaultsResult> {
  const staleAdminDefaults = or(
    isNull(users.plan),
    ne(users.plan, ADMIN_DEFAULT_PLAN),
    isNull(users.isPro),
    eq(users.isPro, false)
  );
  const now = new Date();

  const updatedRows = await db
    .update(users)
    .set({
      plan: ADMIN_DEFAULT_PLAN,
      isPro: true,
      billingUpdatedAt: now,
      updatedAt: now,
    })
    .where(and(eq(users.isAdmin, true), staleAdminDefaults))
    .returning({
      id: users.id,
    });

  return {
    updatedCount: updatedRows.length,
    updatedUserIds: updatedRows.map(row => row.id),
  };
}

async function main() {
  const result = await backfillAdminDefaults();

  if (result.updatedCount === 0) {
    console.log('No admin rows required defaults backfill.');
    return;
  }

  console.log(
    `Backfilled ${result.updatedCount} admin row(s) with max-tier defaults.`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error('Admin defaults backfill failed:', error);
    process.exitCode = 1;
  });
}
