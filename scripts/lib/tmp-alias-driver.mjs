// TEMPORARY JOV-8737 fallback driver (deleted before the PR): identical
// collection via collectAliasGraduation, but the `request` transport shells
// out to `gh api` directly instead of the shared budgeted client — only for
// this one-shot ephemeral hosted runner, where the ledger has no shared state
// to protect. Same complete-enumeration and log-parsing semantics.
import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { collectAliasGraduation } from './public-profile-alias-graduation.mjs';

const exec = promisify(execFile);

const request = async (path, json = true) => {
  const args = ['api', path, '--paginate', ...(json ? ['--slurp'] : [])];
  const { stdout } = await exec('gh', args, {
    maxBuffer: 1024 * 1024 * 1024,
    env: process.env,
  });
  return json ? JSON.parse(stdout) : stdout;
};

const [since, cutoff, nextReviewAt, trackingIssue] = process.argv.slice(2);
const result = await collectAliasGraduation({
  since,
  cutoff,
  nextReviewAt,
  trackingIssue,
  request,
});
const root = new URL('../../docs/performance/', import.meta.url);
mkdirSync(new URL('generated/', root), { recursive: true });
writeFileSync(
  new URL('public-profile-alias-graduation.json', root),
  `${JSON.stringify(result.receipt, null, 2)}\n`
);
writeFileSync(new URL(result.receipt.evidence.inventory, root), result.inventoryText);
writeFileSync(
  new URL(result.receipt.evidence.measurements, root),
  result.measurementsText
);
console.log(JSON.stringify(result.receipt.windows, null, 2));
