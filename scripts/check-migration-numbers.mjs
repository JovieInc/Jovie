#!/usr/bin/env node
/**
 * Migration number guard.
 *  1. A migration added by this branch must be numbered above the latest on the base.
 *  2. Two open PRs must not add migrations with the same number (needs `gh`;
 *     skipped with a notice when unavailable, e.g. inside the lanes self-test).
 * Usage: node scripts/check-migration-numbers.mjs [--base origin/main] [--pr N]
 */
import { execFileSync } from 'node:child_process';

const DIR = 'apps/web/drizzle/migrations/';
const NUM = /^(\d{4})_[^/]+\.sql$/;

export function migrationNumbers(paths) {
  return paths
    .filter(p => p.startsWith(DIR))
    .map(p => NUM.exec(p.slice(DIR.length)))
    .filter(Boolean)
    .map(m => Number(m[1]));
}

/** Pure: returns violation strings. */
export function checkNumbers({ baseLatest, added, otherOpen }) {
  const out = [];
  for (const n of added) {
    if (n <= baseLatest) {
      out.push(
        `migration ${String(n).padStart(4, '0')} is not above main's latest (${String(baseLatest).padStart(4, '0')}); renumber it`
      );
    }
    for (const [pr, nums] of Object.entries(otherOpen)) {
      if (nums.includes(n)) {
        out.push(
          `migration ${String(n).padStart(4, '0')} is also added by open PR #${pr}; the later PR renumbers`
        );
      }
    }
  }
  const dup = added.filter((n, i) => added.indexOf(n) !== i);
  for (const n of new Set(dup))
    out.push(
      `migration ${String(n).padStart(4, '0')} appears twice in this branch`
    );
  return out;
}

const sh = (cmd, args) =>
  execFileSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 64 * 1024 * 1024,
  });

function main() {
  const arg = (k, d) => {
    const i = process.argv.indexOf(k);
    return i > -1 ? process.argv[i + 1] : d;
  };
  const base = arg('--base', 'origin/main');
  const pr = arg('--pr', process.env.PR_NUMBER ?? '');
  const baseFiles = sh('git', ['ls-tree', '-r', '--name-only', base, DIR])
    .split('\n')
    .filter(Boolean);
  const baseLatest = Math.max(0, ...migrationNumbers(baseFiles));
  const added = migrationNumbers(
    sh('git', [
      'diff',
      '--name-only',
      '--diff-filter=A',
      `${base}...HEAD`,
      '--',
      DIR,
    ])
      .split('\n')
      .filter(Boolean)
  );
  const otherOpen = {};
  try {
    const raw = sh('gh', [
      'api',
      'graphql',
      '--paginate',
      '-f',
      'query=query($endCursor:String){repository(owner:"JovieInc",name:"Jovie"){pullRequests(states:OPEN,first:100,after:$endCursor){pageInfo{hasNextPage endCursor}nodes{number files(first:100){nodes{path}}}}}}',
      '--jq',
      '.data.repository.pullRequests.nodes[]|{n:.number,f:[.files.nodes[].path]}',
    ]);
    for (const line of raw.split('\n').filter(Boolean)) {
      const { n, f } = JSON.parse(line);
      if (String(n) === String(pr)) continue;
      const nums = migrationNumbers(f);
      if (nums.length) otherOpen[n] = nums;
    }
  } catch {
    console.log(
      'migration-numbers: open-PR collision check skipped (gh unavailable)'
    );
  }
  const violations = checkNumbers({ baseLatest, added, otherOpen });
  if (violations.length === 0) {
    console.log(
      `migration-numbers: ok (main latest ${baseLatest}, added ${added.join(',') || 'none'})`
    );
    return 0;
  }
  console.error('migration-numbers: FAILED');
  for (const v of violations) console.error(`  - ${v}`);
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
