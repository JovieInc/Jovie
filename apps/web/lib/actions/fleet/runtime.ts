import 'server-only';
import { and, eq } from 'drizzle-orm';
import { isAdmin } from '@/lib/admin/roles';
import { getCachedAuth } from '@/lib/auth/cached';
import { withDbSessionTx } from '@/lib/auth/session';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { env } from '@/lib/env-server';
import { postgresRecordBackend } from '@/lib/ovie/mcp/postgres-backend';
import { fetchWithTimeout } from '@/lib/queries/fetch';
import { FleetDispatcher } from './dispatcher';
import type { FleetHttpDependencies } from './http';
import { createFleetLinear } from './linear';

export function fleetRuntime(): FleetHttpDependencies {
  const enabled = env.JOVIE_FLEET_ENABLED === '1';
  const linear =
    env.LINEAR_API_KEY && env.JOVIE_FLEET_LINEAR_TEAM_ID
      ? createFleetLinear({
          teamId: env.JOVIE_FLEET_LINEAR_TEAM_ID,
          async graphql<T>(
            query: string,
            variables: Record<string, unknown>
          ): Promise<T> {
            // No automatic HTTP mutation retries. The durable operation retries with
            // the same provider IDs and reads back ambiguous results.
            const payload = await fetchWithTimeout<{
              data?: T;
              errors?: unknown[];
            }>('https://api.linear.app/graphql', {
              method: 'POST',
              headers: {
                Authorization: env.LINEAR_API_KEY!,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ query, variables }),
              timeout: 15_000,
            });
            if (payload.errors?.length || !payload.data)
              throw new Error('linear_provider_unavailable');
            return payload.data;
          },
        })
      : undefined;
  return {
    dispatcher: new FleetDispatcher({
      backend: postgresRecordBackend(),
      enabled,
      linear,
    }),
    validateMission: linear?.validateMission,
    async founder(request, profileId) {
      if (request.headers.has('authorization')) return null;
      const { userId } = await getCachedAuth();
      if (!userId || !(await isAdmin(userId))) return null;
      return withDbSessionTx(async (tx, appUserId) => {
        const [owned] = await tx
          .select({ id: creatorProfiles.id })
          .from(creatorProfiles)
          .where(
            and(
              eq(creatorProfiles.id, profileId),
              eq(creatorProfiles.userId, appUserId)
            )
          )
          .limit(1);
        return owned ? appUserId : null;
      });
    },
  };
}
