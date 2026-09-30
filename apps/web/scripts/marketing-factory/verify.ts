/**
 * `pnpm factory:verify <pageId>` (JOV-7276): re-checks every receipt digest,
 * chain link and spine rule for a factory run. Exits 1 on any issue.
 */

import { join } from 'node:path';
import { FACTORY_RUNS_DIR, verifyFactoryRun } from './receipts';

const pageId = process.argv[2];
if (!pageId) {
  console.error('usage: factory:verify <pageId>');
  process.exitCode = 1;
} else {
  const issues = verifyFactoryRun(join(FACTORY_RUNS_DIR, pageId));
  for (const issue of issues) console.error(`  ${issue}`);
  console.log(
    `factory:verify ${pageId}: ${issues.length === 0 ? 'ok' : `${issues.length} issue(s)`}`
  );
  process.exitCode = issues.length === 0 ? 0 : 1;
}
