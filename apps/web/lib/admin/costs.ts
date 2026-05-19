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

const DEFAULT_COST_SEEDS: Array<{
  label: string;
  monthlyUsd: string;
  observed30dUsd: string;
  period: string;
  notes: string;
  externalUrl?: string;
}> = [
  {
    label: 'Vercel AI Gateway',
    monthlyUsd: '0',
    observed30dUsd: '0',
    period: 'usage-based',
    notes:
      'Primary LLM + image gen spend (album art, pitches, etc.). Check Vercel team usage dashboard.',
    externalUrl: 'https://vercel.com/dashboard',
  },
  {
    label: 'Neon Postgres (prod + preview)',
    monthlyUsd: '0',
    observed30dUsd: '0',
    period: 'monthly',
    notes: 'Primary database. Includes compute + storage.',
    externalUrl: 'https://console.neon.tech',
  },
  {
    label: 'Anthropic / Claude',
    monthlyUsd: '0',
    observed30dUsd: '0',
    period: 'monthly',
    notes: 'API + console seats for agent orchestration and evals.',
    externalUrl: 'https://console.anthropic.com',
  },
  {
    label: 'OpenAI',
    monthlyUsd: '0',
    observed30dUsd: '0',
    period: 'usage-based',
    notes: 'API spend for legacy/backup paths and evals.',
    externalUrl: 'https://platform.openai.com/usage',
  },
  {
    label: 'OpenRouter',
    monthlyUsd: '0',
    observed30dUsd: '0',
    period: 'usage-based',
    notes: 'Routed LLM calls (fallback + model mixing).',
    externalUrl: 'https://openrouter.ai/activity',
  },
];

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

  if (rows.length === 0) {
    // Seed on first access (manual v1; idempotent-ish for demo)
    await seedDefaultCosts();
    const seeded = await db
      .select()
      .from(adminCosts)
      .where(eq(adminCosts.isActive, true))
      .orderBy(adminCosts.label);
    return seeded.map(mapRow);
  }

  return rows.map(mapRow);
}

async function seedDefaultCosts(): Promise<void> {
  const now = new Date();
  const values = DEFAULT_COST_SEEDS.map(seed => ({
    label: seed.label,
    monthlyUsd: seed.monthlyUsd,
    observed30dUsd: seed.observed30dUsd,
    period: seed.period,
    notes: seed.notes,
    externalUrl: seed.externalUrl ?? null,
    isActive: true,
    updatedAt: now,
  }));

  await db.insert(adminCosts).values(values).onConflictDoNothing();
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
  if (input.id) {
    await db
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
