import 'server-only';

import { sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { adminSystemSettings } from '@/lib/db/schema/admin';
import { users } from '@/lib/db/schema/auth';
import { captureWarning } from '@/lib/error-tracking';

const SETTINGS_ROW_ID = 1;
const CACHE_TTL_MS = 15_000;

export const OPERATIONAL_CONTROL_KEYS = [
  'signupEnabled',
  'checkoutEnabled',
  'stripeWebhooksEnabled',
  'cronFanoutEnabled',
] as const;

export interface OperationalControls {
  readonly signupEnabled: boolean;
  readonly checkoutEnabled: boolean;
  readonly stripeWebhooksEnabled: boolean;
  readonly cronFanoutEnabled: boolean;
  readonly updatedAt: Date | null;
  readonly updatedByUserId: string | null;
}

export interface UpdateOperationalControlsInput {
  readonly signupEnabled?: boolean;
  readonly checkoutEnabled?: boolean;
  readonly stripeWebhooksEnabled?: boolean;
  readonly cronFanoutEnabled?: boolean;
}

interface GetOperationalControlsOptions {
  readonly strict?: boolean;
}

const FAIL_CLOSED_OPERATIONAL_CONTROLS: OperationalControls = {
  signupEnabled: false,
  checkoutEnabled: false,
  stripeWebhooksEnabled: false,
  cronFanoutEnabled: false,
  updatedAt: null,
  updatedByUserId: null,
};

// This cache is intentionally per-instance. Updates apply immediately in the
// current runtime and may take up to CACHE_TTL_MS to propagate across other
// warm instances.
let operationalControlsCache: {
  readonly value: OperationalControls;
  readonly expiresAt: number;
} | null = null;

function mapOperationalControls(
  row: typeof adminSystemSettings.$inferSelect
): OperationalControls {
  return {
    signupEnabled: row.signupEnabled,
    checkoutEnabled: row.checkoutEnabled,
    stripeWebhooksEnabled: row.stripeWebhooksEnabled,
    cronFanoutEnabled: row.cronFanoutEnabled,
    updatedAt: row.operationalControlsUpdatedAt ?? null,
    updatedByUserId: row.operationalControlsUpdatedBy ?? null,
  };
}

async function readSettingsRow() {
  const [row] = await db
    .select()
    .from(adminSystemSettings)
    .where(eq(adminSystemSettings.id, SETTINGS_ROW_ID))
    .limit(1);

  return row ?? null;
}

async function ensureSettingsRow() {
  const existing = await readSettingsRow();
  if (existing) return existing;

  const now = new Date();
  const [created] = await db
    .insert(adminSystemSettings)
    .values({
      id: SETTINGS_ROW_ID,
      signupEnabled: true,
      checkoutEnabled: true,
      stripeWebhooksEnabled: true,
      cronFanoutEnabled: true,
      operationalControlsUpdatedAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  const reloaded = await readSettingsRow();
  if (!reloaded) {
    throw new Error('Failed to create operational controls settings row');
  }

  return reloaded;
}

async function resolveUpdatedByUserId(
  clerkUserId: string | null
): Promise<string | null> {
  if (!clerkUserId) {
    return null;
  }

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  return user?.id ?? null;
}

export function invalidateOperationalControlsCache(): void {
  operationalControlsCache = null;
}

export async function getOperationalControls(
  options: GetOperationalControlsOptions = {}
): Promise<OperationalControls> {
  if (
    operationalControlsCache &&
    Date.now() < operationalControlsCache.expiresAt
  ) {
    return operationalControlsCache.value;
  }

  try {
    const row = await ensureSettingsRow();
    const controls = mapOperationalControls(row);
    operationalControlsCache = {
      value: controls,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    return controls;
  } catch (error) {
    await captureWarning(
      'Failed to read operational controls; using last known or fail-closed state',
      error,
      { route: 'lib/admin/operational-controls' }
    );
    if (options.strict) {
      throw error;
    }

    return operationalControlsCache?.value ?? FAIL_CLOSED_OPERATIONAL_CONTROLS;
  }
}

export async function updateOperationalControls(
  input: UpdateOperationalControlsInput,
  updatedByClerkUserId: string | null
): Promise<OperationalControls> {
  await ensureSettingsRow();
  const updatedByUserId = await resolveUpdatedByUserId(updatedByClerkUserId);
  const now = new Date();

  const [updated] = await db
    .update(adminSystemSettings)
    .set({
      signupEnabled:
        input.signupEnabled === undefined
          ? drizzleSql`${adminSystemSettings.signupEnabled}`
          : input.signupEnabled,
      checkoutEnabled:
        input.checkoutEnabled === undefined
          ? drizzleSql`${adminSystemSettings.checkoutEnabled}`
          : input.checkoutEnabled,
      stripeWebhooksEnabled:
        input.stripeWebhooksEnabled === undefined
          ? drizzleSql`${adminSystemSettings.stripeWebhooksEnabled}`
          : input.stripeWebhooksEnabled,
      cronFanoutEnabled:
        input.cronFanoutEnabled === undefined
          ? drizzleSql`${adminSystemSettings.cronFanoutEnabled}`
          : input.cronFanoutEnabled,
      operationalControlsUpdatedAt: now,
      operationalControlsUpdatedBy: updatedByUserId,
      updatedAt: now,
    })
    .where(eq(adminSystemSettings.id, SETTINGS_ROW_ID))
    .returning();

  if (!updated) {
    throw new Error('Failed to update operational controls');
  }

  const controls = mapOperationalControls(updated);
  operationalControlsCache = {
    value: controls,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  return controls;
}
