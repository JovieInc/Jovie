#!/usr/bin/env node
/**
 * Single-writer policy for `cursor/stable-desktop-publish-*` stamp PRs.
 *
 * desktop-release opens at most one stamp. When that stamp is still landable
 * (checks in flight, clean, or merely unknown), it owns the publisher. When it
 * is DIRTY/behind or lane-fix-exhausted, keeping it forever starves Tim's Mac
 * dogfood (observed: #25802 open 2026-11-16..20 with no new publish). Supersede
 * closes that PR so a fresh stamp can open from the current verified generation.
 */

export const STAMP_BRANCH_PREFIX = 'cursor/stable-desktop-publish-';

/**
 * @param {{
 *   draft?: boolean,
 *   mergeable_state?: string | null,
 *   labels?: Array<{ name?: string } | string> | null,
 *   html_url?: string | null,
 *   number?: number | null,
 *   head?: { ref?: string | null } | null,
 * } | null | undefined} pr
 */
export function stampOwnershipDecision(pr) {
  if (!pr) return { action: 'create', reason: 'no-open-stamp' };

  const labels = new Set(
    (pr.labels ?? [])
      .map(label =>
        String(typeof label === 'string' ? label : (label?.name ?? ''))
          .trim()
          .toLowerCase()
      )
      .filter(Boolean)
  );
  if (labels.has('lane-fix-exhausted')) {
    return {
      action: 'supersede',
      reason: 'lane-fix-exhausted',
      number: pr.number ?? null,
      url: pr.html_url ?? null,
      headRef: pr.head?.ref ?? null,
    };
  }

  const state = String(pr.mergeable_state ?? '')
    .trim()
    .toLowerCase();
  if (state === 'dirty' || state === 'behind') {
    return {
      action: 'supersede',
      reason: `mergeable_state=${state}`,
      number: pr.number ?? null,
      url: pr.html_url ?? null,
      headRef: pr.head?.ref ?? null,
    };
  }

  return {
    action: 'keep',
    reason: pr.draft
      ? 'draft-in-progress'
      : `mergeable_state=${state || 'unknown'}`,
    number: pr.number ?? null,
    url: pr.html_url ?? null,
    headRef: pr.head?.ref ?? null,
  };
}

/**
 * Pick the open stamp PR from a pulls list payload (possibly paginated slurp).
 * @param {unknown} pullsPayload
 * @param {string} repository
 */
export function findOpenDesktopStampPr(pullsPayload, repository) {
  const pages = Array.isArray(pullsPayload) ? pullsPayload : [pullsPayload];
  const matches = [];
  for (const page of pages) {
    const rows = Array.isArray(page) ? page : [];
    for (const pr of rows) {
      if (
        pr?.base?.ref === 'main' &&
        pr?.head?.repo?.full_name === repository &&
        String(pr?.head?.ref ?? '').startsWith(STAMP_BRANCH_PREFIX)
      ) {
        matches.push(pr);
      }
    }
  }
  return matches;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', chunk => chunks.push(chunk));
    process.stdin.on('end', () =>
      resolve(Buffer.concat(chunks).toString('utf8'))
    );
    process.stdin.on('error', reject);
  });
}

async function main(argv = process.argv.slice(2)) {
  if (argv[0] !== 'decide') {
    console.error(
      'usage: desktop-stamp-ownership.mjs decide --repository owner/name < pulls.json'
    );
    process.exit(2);
  }
  const repoFlag = argv.indexOf('--repository');
  const repository = repoFlag >= 0 ? argv[repoFlag + 1] : '';
  if (!repository || !repository.includes('/')) {
    console.error('decide requires --repository owner/name');
    process.exit(2);
  }
  const raw = await readStdin();
  const payload = JSON.parse(raw || '[]');
  const matches = findOpenDesktopStampPr(payload, repository);
  if (matches.length > 1) {
    console.log(
      JSON.stringify({
        action: 'error',
        reason: 'multiple-open-stamps',
        count: matches.length,
      })
    );
    process.exit(0);
  }
  console.log(JSON.stringify(stampOwnershipDecision(matches[0] ?? null)));
}

const isCli =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isCli) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
