import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  type AdminCost,
  adminCosts,
  adminSystemSettings,
} from '@/lib/db/schema/admin';

export type AdminCostRow = AdminCost & {
  readonly lastUpdatedLabel: string;
};

function mapRow(row: AdminCost): AdminCostRow {
  return {
    ...row,
    lastUpdatedLabel: row.updatedAt
      ? new Date(row.updatedAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        })
      : '—',
  };
}

export async function getAdminCosts(): Promise<AdminCostRow[]> {
  const rows = await db
    .select()
    .from(adminCosts)
    .where(eq(adminCosts.isActive, true))
    .orderBy(adminCosts.label);

  return rows.map(mapRow);
}

export async function getCostsLastRefreshedAt(): Promise<Date | null> {
  const [row] = await db
    .select({ ts: adminSystemSettings.costsLastRefreshedAt })
    .from(adminSystemSettings)
    .limit(1);
  return row?.ts ?? null;
}

export async function markCostsRefreshed(): Promise<Date> {
  const now = new Date();
  await db
    .update(adminSystemSettings)
    .set({ costsLastRefreshedAt: now, updatedAt: now })
    .where(eq(adminSystemSettings.id, 1));
  return now;
}

/** For v1 manual edit surface (server action friendly). */
export async function upsertAdminCost(input: {
  id?: string;
  label: string;
  monthlyUsd: string;
  observed30dUsd: string;
  period?: string;
  notes?: string;
  externalUrl?: string | null;
}): Promise<void> {
  const now = new Date();

  // Validate decimal strings for numeric columns (per CodeRabbit review)
  const decimalRe = /^-?\d+(\.\d+)?$/;
  if (
    !decimalRe.test(input.monthlyUsd) ||
    !decimalRe.test(input.observed30dUsd)
  ) {
    throw new Error(
      'monthlyUsd and observed30dUsd must be valid decimal strings (e.g. "0", "123.45")'
    );
  }

  if (input.id) {
    const result = await db
      .update(adminCosts)
      .set({
        label: input.label,
        monthlyUsd: input.monthlyUsd,
        observed30dUsd: input.observed30dUsd,
        period: input.period ?? 'monthly',
        notes: input.notes ?? '',
        externalUrl: input.externalUrl ?? null,
        updatedAt: now,
      })
      .where(eq(adminCosts.id, input.id));

    // Verify update affected a row (per CodeRabbit); throw on missing id
    if ((result as { rowCount?: number | null }).rowCount === 0) {
      throw new Error(`Admin cost with id ${input.id} not found`);
    }
  } else {
    await db.insert(adminCosts).values({
      label: input.label,
      monthlyUsd: input.monthlyUsd,
      observed30dUsd: input.observed30dUsd,
      period: input.period ?? 'monthly',
      notes: input.notes ?? '',
      externalUrl: input.externalUrl ?? null,
      isActive: true,
      updatedAt: now,
    });
  }
}
