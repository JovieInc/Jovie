import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { env } from '@/lib/env-server';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';
import { fleetRuntime } from './runtime';
import type { SummerFleetHttpDependencies } from './summer-http';

export function summerFleetRuntime(): SummerFleetHttpDependencies {
  const fleet = fleetRuntime();
  return {
    authenticate: verifySummerOidcRequest,
    dispatcher: fleet.dispatcher,
    async profiles() {
      const founder = env.OVIE_SUMMER_FOUNDER_APP_USER_ID;
      if (!founder || env.JOVIE_FLEET_ENABLED !== '1') return [];
      return (
        await db
          .select({ id: creatorProfiles.id })
          .from(creatorProfiles)
          .where(eq(creatorProfiles.userId, founder))
          .limit(100)
      ).map(profile => profile.id);
    },
    async validateMission(mission) {
      if (!fleet.validateMission) throw new Error('canonical_work_unavailable');
      return fleet.validateMission(mission);
    },
  };
}
