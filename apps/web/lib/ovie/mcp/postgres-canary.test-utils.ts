import {
  actionResultSchema,
  FLEET_ACTION_IDS,
  type FleetActionId,
  getActionDescriptor,
} from '@jovie/action-contracts';
import { expect } from 'vitest';
import type { FleetResult } from '@/lib/actions/fleet/dispatcher';

type CanaryClients = { end: () => Promise<void> }[];

/** Opt-in, disposable loopback database only; never a production URL. */
export async function setupLocalPostgresCanary(
  url: string | undefined,
  clients: CanaryClients
) {
  if (!url) return { db: undefined };
  const parsed = new URL(url);
  if (
    !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
    parsed.pathname !== '/jov7331_canary'
  ) {
    throw new Error('Disposable local canary database required');
  }
  const [{ drizzle }, { default: postgres }, { ovieOperatingKv }] =
    await Promise.all([
      import('drizzle-orm/postgres-js'),
      import('postgres'),
      import('@/lib/db/schema/ovie'),
    ]);
  const client = postgres(url, { max: 4 });
  clients.push(client);
  await client`CREATE TABLE IF NOT EXISTS ovie_operating_kv (key text PRIMARY KEY,value jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now())`;
  return { db: drizzle(client, { schema: { ovieOperatingKv } }) };
}

/** Validate the canonical action result before using a completed canary payload. */
export function completedFleetResult(
  result: FleetResult,
  expectedId?: FleetActionId
) {
  expect(result.status).toBe('completed');
  if (result.status !== 'completed') throw new Error(JSON.stringify(result));
  const actionId =
    expectedId ?? FLEET_ACTION_IDS.find(id => id === result.receipt.actionId);
  if (!actionId) throw new Error('Fleet action receipt required');
  expect(
    actionResultSchema(getActionDescriptor(actionId).outputSchema).safeParse(
      result
    ).success
  ).toBe(true);
  return result.data;
}
