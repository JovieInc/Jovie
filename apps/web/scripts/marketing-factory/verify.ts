/**
 * `pnpm factory:verify <pageId>` (JOV-7276): re-checks every receipt digest,
 * chain link and spine rule for a factory run.
 *
 * `pnpm factory:verify --blog-record <path>` (JOV-7397) applies the blog
 * family adapter to an exact candidate record. Missing publication authority
 * exits 2 and is reported as authorization-required, never PASS.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { certifyBlogFactoryRecord } from './blog-adapter';
import { FACTORY_RUNS_DIR, verifyFactoryRun } from './receipts';

const pageId = process.argv[2];
if (pageId === '--blog-record') {
  const path = process.argv[3];
  if (!path) {
    console.error('usage: factory:verify --blog-record <path>');
    process.exitCode = 1;
  } else {
    const record = JSON.parse(readFileSync(path, 'utf8')) as {
      candidate?: { sourcePath?: unknown };
    };
    const sourcePath = record.candidate?.sourcePath;
    const safeSourcePath =
      typeof sourcePath === 'string' &&
      /^content\/blog\/[a-z0-9-]+\.md$/u.test(sourcePath)
        ? sourcePath
        : null;
    let sourceContent: string | undefined;
    try {
      if (safeSourcePath) {
        sourceContent = readFileSync(
          join(import.meta.dirname, '../..', safeSourcePath),
          'utf8'
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const result = certifyBlogFactoryRecord(record, { sourceContent });
    for (const issue of result.issues) {
      console.error(
        `  ${issue.stage ? `${issue.stage}: ` : ''}${issue.code}: ${issue.message}`
      );
    }
    console.log(`factory:verify blog ${path}: ${result.verdict}`);
    process.exitCode =
      result.verdict === 'pass'
        ? 0
        : result.verdict === 'authorization-required'
          ? 2
          : 1;
  }
} else if (!pageId) {
  console.error(
    'usage: factory:verify <pageId> | factory:verify --blog-record <path>'
  );
  process.exitCode = 1;
} else {
  const issues = verifyFactoryRun(join(FACTORY_RUNS_DIR, pageId));
  for (const issue of issues) console.error(`  ${issue}`);
  console.log(
    `factory:verify ${pageId}: ${issues.length === 0 ? 'ok' : `${issues.length} issue(s)`}`
  );
  process.exitCode = issues.length === 0 ? 0 : 1;
}
