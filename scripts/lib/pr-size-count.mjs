#!/usr/bin/env node
/**
 * The one PR Size Guard line counter. Same rows as `pulls/<n>/files`: renames
 * count once under the new path, binary files count zero lines. Extracted
 * verbatim from the inline script in .github/workflows/pr-size-guard.yml so the
 * pre-push hook (scripts/hooks/pr-size-local.mjs) and CI count identically.
 * The workflow switches to this module in a LATER, separately reviewed change.
 *
 * CLI: node scripts/lib/pr-size-count.mjs <base> [head] -> "<lines>\t<path>" rows
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Parse `git diff --numstat -z -M` output into "<lines>\t<path>" rows. */
export function parseNumstatZ(raw) {
  const parts = raw.split('\0');
  const rows = [];
  for (let i = 0; i < parts.length; ) {
    const record = parts[i++];
    if (!record) continue;
    const [added, deleted, path] = record.split('\t');
    let name = path;
    // Renames: "<a>\t<d>\t" then old path, then new path as separate fields.
    if (path === '') {
      i += 1;
      name = parts[i++];
    }
    const lines =
      (added === '-' ? 0 : Number(added)) +
      (deleted === '-' ? 0 : Number(deleted));
    if (!Number.isSafeInteger(lines) || !name) {
      throw new Error(`unparseable numstat row: ${record}`);
    }
    rows.push(`${lines}\t${name}`);
  }
  return rows;
}

/** Rows for base..head using the same git invocation CI uses. */
export function countRows(base, head = 'HEAD', cwd = process.cwd()) {
  const out = execFileSync(
    'git',
    ['diff', '--numstat', '-z', '-M', base, head],
    { cwd, maxBuffer: 256 * 1024 * 1024 }
  );
  return parseNumstatZ(out.toString('utf8'));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [base, head = 'HEAD'] = process.argv.slice(2);
  if (!base) {
    console.error('usage: pr-size-count.mjs <base> [head]');
    process.exit(2);
  }
  process.stdout.write(countRows(base, head).join('\n'));
}
