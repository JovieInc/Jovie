import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agentRuns } from '@/lib/db/schema/connectors';

export type AdminAgentRun = NonNullable<
  Awaited<ReturnType<typeof loadAdminAgentRun>>
>;

export async function loadAdminAgentRun(id: string) {
  const [run] = await db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.id, id))
    .limit(1);

  return run ?? null;
}
