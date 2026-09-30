/**
 * `pnpm factory:truth-sync` (JOV-7247).
 *
 * Hashes every product-truth claim and compares against the committed
 * digest. Reports added/changed/removed claims and the routes they affect.
 *
 *   --check (default)  exit 1 when the digest is out of date
 *   --write            rewrite the digest file
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listProductTruthClaims } from '@/data/product-truth/claims';
import { ClaimSchema } from '@/data/product-truth/registry';
import {
  buildTruthDigest,
  diffTruthDigest,
  formatTruthDigest,
  isDigestInSync,
  type TruthDigest,
} from '@/data/product-truth/truth-sync';

const DIGEST_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../data/product-truth/claim-digest.gen.json'
);

function readDigest(): TruthDigest | null {
  try {
    return JSON.parse(readFileSync(DIGEST_PATH, 'utf8')) as TruthDigest;
  } catch {
    return null;
  }
}

function main(): number {
  const write = process.argv.includes('--write');
  const claims = listProductTruthClaims();
  for (const claim of claims) ClaimSchema.parse(claim);

  const next = buildTruthDigest(claims);
  const diff = diffTruthDigest(readDigest(), next);

  console.log(`[truth-sync] ${claims.length} claims hashed`);
  for (const [label, ids] of [
    ['added', diff.added],
    ['changed', diff.changed],
    ['removed', diff.removed],
  ] as const) {
    if (ids.length > 0) console.log(`[truth-sync] ${label}: ${ids.join(', ')}`);
  }
  if (diff.affectedRoutes.length > 0) {
    console.log(
      `[truth-sync] affected routes: ${diff.affectedRoutes.join(', ')}`
    );
  }

  if (isDigestInSync(diff)) {
    console.log('[truth-sync] digest in sync');
    return 0;
  }
  if (write) {
    writeFileSync(DIGEST_PATH, formatTruthDigest(next));
    console.log(
      `[truth-sync] wrote ${path.relative(process.cwd(), DIGEST_PATH)}`
    );
    return 0;
  }
  console.error(
    '[truth-sync] digest out of date: re-render affected pages, then run `pnpm factory:truth-sync --write`'
  );
  return 1;
}

process.exitCode = main();
