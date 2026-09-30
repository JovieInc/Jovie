import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { listProductTruthClaims } from './claims';
import {
  type Claim,
  ClaimSchema,
  getCapabilityRoutes,
  getProductCapability,
} from './registry';

/**
 * Truth-sync (JOV-7247). Run with `pnpm factory:truth-sync`.
 *
 * Hashes every registered claim and reports the public routes it affects, so
 * a copy or offer edit shows exactly which surfaces carry the statement.
 * Exits non-zero if any claim fails schema validation or binds an unknown
 * capability.
 */

export function hashClaim(claim: Claim): string {
  return createHash('sha256')
    .update(
      `${claim.id}|${claim.capabilityId}|${claim.kind}|${claim.statement}`
    )
    .digest('hex')
    .slice(0, 12);
}

function main(): void {
  let failures = 0;

  for (const claim of listProductTruthClaims()) {
    const capability = getProductCapability(claim.capabilityId);
    const routes = getCapabilityRoutes(claim.capabilityId);
    const problems: string[] = [];

    if (!capability) {
      problems.push(`unknown capability ${claim.capabilityId}`);
    }
    const parsed = ClaimSchema.safeParse(claim);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        problems.push(`${issue.path.join('.')}: ${issue.message}`);
      }
    }
    failures += problems.length;

    const routeList =
      routes.length > 0 ? routes.join(', ') : '(no public pages)';
    console.log(
      `${hashClaim(claim)}  ${claim.id}  [${claim.kind}]  -> ${routeList}  (${claim.source})`
    );
    for (const problem of problems) {
      console.error(`  INVALID: ${problem}`);
    }
  }

  const claims = listProductTruthClaims();
  console.log(`\n${claims.length} claims hashed, ${failures} invalid.`);
  if (failures > 0) process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
