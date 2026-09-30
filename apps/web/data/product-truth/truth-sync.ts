import { createHash } from 'node:crypto';

import {
  getCapability,
  PRODUCT_TRUTH_CLAIMS,
  validateClaim,
} from '@/data/product-truth/registry';

/**
 * Truth-sync (JOV-7247). Run with `pnpm factory:truth-sync`.
 *
 * Hashes every registered claim and reports the pages it affects, so a copy
 * or offer edit shows exactly which public surfaces carry the statement.
 * Exits non-zero if any claim fails shape validation.
 */

export function hashClaim(claim: {
  id: string;
  capabilityId: string;
  kind: string;
  statement: string;
}): string {
  return createHash('sha256')
    .update(
      `${claim.id}|${claim.capabilityId}|${claim.kind}|${claim.statement}`
    )
    .digest('hex')
    .slice(0, 12);
}

function main(): void {
  let failures = 0;

  for (const claim of PRODUCT_TRUTH_CLAIMS) {
    const capability = getCapability(claim.capabilityId);
    const pages = capability?.evidence.routes ?? [];
    const problems = validateClaim(claim);
    failures += problems.length;

    const pageList = pages.length > 0 ? pages.join(', ') : '(no public pages)';
    console.log(
      `${hashClaim(claim)}  ${claim.id}  [${claim.kind}]  -> ${pageList}  (${claim.source})`
    );
    for (const problem of problems) {
      console.error(`  INVALID: ${problem}`);
    }
  }

  console.log(
    `\n${PRODUCT_TRUTH_CLAIMS.length} claims hashed, ${failures} invalid.`
  );
  if (failures > 0) process.exitCode = 1;
}

main();
