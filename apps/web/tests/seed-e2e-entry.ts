/**
 * E2E seed entrypoint (package.json `seed:test-data`).
 *
 * Enforces the public-surface not-found probe precondition — the probe
 * handles must stay MISSING so the 404 boundary renders — then delegates to
 * the canonical seed in ./seed-test-data. Kept out of seed-test-data.ts
 * itself because that file is pinned by the shrink-only size-500 budget.
 *
 * The seed lives in tests/ so it can be imported by Playwright global setup
 * without Next's server-only env modules.
 */

import { neon } from '@neondatabase/serverless';
import { sql as drizzleSql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { creatorProfiles } from '@/lib/db/schema/profiles';

/** Same resolution order as getSeedEnv in ./seed-test-data. */
const databaseUrl =
  process.env.DATABASE_URL?.trim() || process.env.DATABASE_URL_DIRECT?.trim();

/** The handle the surface manifests probe and require to be missing. */
const missingProbeHandle =
  process.env.PUBLIC_SURFACE_MISSING_PROFILE?.trim() || 'missing-qa-user';

async function enforceNotFoundProbePrecondition(): Promise<void> {
  if (!databaseUrl) return;
  const db = drizzle(neon(databaseUrl), { schema: { creatorProfiles } });
  const removed = await db
    .delete(creatorProfiles)
    .where(
      // Case-insensitive: the loader resolves handles lowercased.
      drizzleSql`lower(${creatorProfiles.usernameNormalized}) = lower(${missingProbeHandle}) or lower(${creatorProfiles.username}) = lower(${missingProbeHandle})`
    )
    .returning({ id: creatorProfiles.id });
  if (removed.length > 0) {
    console.log(
      `  Removed ${removed.length} stale profile(s) holding the not-found probe handle ${missingProbeHandle}`
    );
  }
}

async function main() {
  await enforceNotFoundProbePrecondition();
  const { seedTestData } = await import('./seed-test-data');
  await seedTestData({
    readyCreatorReleasesOnly: process.argv.includes(
      '--ready-creator-releases-only'
    ),
  });
}

main()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  });
