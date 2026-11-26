#!/usr/bin/env node
// Free first pass for the local Warden review (scripts/hooks/warden-local-review.sh).
//
// Deterministic rules decide whether a diff is worth a paid model review, so
// docs-only, lockfile-only, asset-only, test-only and tiny diffs never spend
// API credits. Risky paths (auth, billing, migrations, workflows, secrets,
// middleware, API routes, webhooks) are always reviewed, whatever their size.
//
// CLI: node scripts/hooks/warden-triage.mjs staged|branch [base]
//   prints one line, `review: <reason>` or `skip: <reason>`
//   exit 0 = review, exit 3 = skip. Any other failure prints `review: …` and
//   exits 0, so a broken triage never hides a review (nothing fails silently).
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const SKIP_EXIT = 3;
export const MIN_CHANGED_LINES = 3;

export const RISKY = [
  /(^|\/)(auth|authn|authz|session|sessions|login|oauth|sso|clerk)(\/|\.|-|_)/i,
  /(billing|stripe|payment|payments|checkout|invoice|subscription)/i,
  /(^|\/)(migrations?|drizzle|supabase)(\/|$)/i,
  /\.sql$/i,
  /^\.github\/workflows\//,
  /(secret|secrets|credential|security|permission|rbac)/i,
  /(^|\/)\.env(\.|$)/,
  /(^|\/)(middleware|proxy)\.(t|j)sx?$/,
  /(^|\/)app\/api\//,
  /(^|\/)api\/.*route\.(t|j)sx?$/,
  /webhooks?/i,
];

const DOCS = /\.(md|mdx|txt|rst)$/i;
const LOCKFILES =
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|Podfile\.lock|Package\.resolved|Gemfile\.lock|Cargo\.lock|poetry\.lock|uv\.lock)$/;
const ASSETS =
  /\.(png|jpe?g|gif|webp|avif|svg|ico|icns|pdf|mp4|mov|webm|mp3|wav|woff2?|ttf|otf|snap)$/i;
const SNAPSHOT = /(^|\/)__snapshots__\//;
const TESTS =
  /(\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)(__tests__|tests?|e2e)\/|Tests?\.swift$|(^|\/)[^/]*Tests\/)/;

function isLowRisk(path) {
  return (
    DOCS.test(path) ||
    LOCKFILES.test(path) ||
    ASSETS.test(path) ||
    SNAPSHOT.test(path) ||
    TESTS.test(path)
  );
}

/**
 * @param {{ path: string, added: number | null, deleted: number | null }[]} files
 *   numstat rows; null counts mean a binary file.
 * @returns {{ review: boolean, reason: string }}
 */
export function triage(files) {
  if (files.length === 0) return { review: false, reason: 'no changes' };

  const risky = files.find(file =>
    RISKY.some(pattern => pattern.test(file.path))
  );
  if (risky) return { review: true, reason: `risky path ${risky.path}` };

  if (files.every(file => isLowRisk(file.path))) {
    return {
      review: false,
      reason: 'only docs, lockfiles, assets, snapshots or tests changed',
    };
  }

  const changed = files.reduce(
    (sum, file) => sum + (file.added ?? 0) + (file.deleted ?? 0),
    0
  );
  if (changed < MIN_CHANGED_LINES) {
    return { review: false, reason: `tiny diff (${changed} changed lines)` };
  }

  const code = files.filter(file => !isLowRisk(file.path)).length;
  return {
    review: true,
    reason: `${code} code file(s), ${changed} changed lines`,
  };
}

/** Parse `git diff --numstat -z`-free output (one `added\tdeleted\tpath` per line). */
export function parseNumstat(text) {
  return text
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [added, deleted, ...rest] = line.split('\t');
      let path = rest.join('\t');
      // Renames print as `old => new` or `dir/{old => new}/file`; keep the new path.
      path = path
        .replace(/\{[^{}]* => ([^{}]*)\}/g, '$1')
        .replace(/^.* => /, '');
      return {
        path: path.replace(/\/\//g, '/'),
        added: added === '-' ? null : Number(added),
        deleted: deleted === '-' ? null : Number(deleted),
      };
    });
}

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

function diffArgs(mode, base) {
  if (mode === 'staged') return ['diff', '--cached', '--numstat', '-M'];
  const target = base || 'origin/main';
  const mergeBase = git(['merge-base', target, 'HEAD']).trim();
  return ['diff', '--numstat', '-M', `${mergeBase}...HEAD`];
}

export function main(argv = process.argv.slice(2)) {
  const [mode, base] = argv;
  if (mode !== 'staged' && mode !== 'branch') {
    console.log(`review: unknown triage mode '${mode ?? ''}'`);
    return 0;
  }
  try {
    const verdict = triage(parseNumstat(git(diffArgs(mode, base))));
    console.log(`${verdict.review ? 'review' : 'skip'}: ${verdict.reason}`);
    return verdict.review ? 0 : SKIP_EXIT;
  } catch (error) {
    console.log(`review: triage failed (${error.message.split('\n')[0]})`);
    return 0;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(main());
}
