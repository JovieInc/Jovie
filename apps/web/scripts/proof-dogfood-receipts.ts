/**
 * `pnpm proof:dogfood` (JOV-7750): the dogfood proof generator.
 *
 * Runs every DOGFOOD_RECEIPT_QUERIES statement through the read-only
 * production helper (`scripts/db/prod-read.mjs`, BEGIN READ ONLY on the
 * direct endpoint) and rewrites `data/product-truth/dogfood-receipts.gen.json`.
 * Then run `pnpm factory:truth-sync --write` so the claim digest re-renders
 * every factory page that cites a changed receipt.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDogfoodReceipts,
  DOGFOOD_RECEIPT_QUERIES,
  parseProdReadCount,
} from '@/data/product-truth/dogfood';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROD_READ = path.resolve(HERE, '../../../scripts/db/prod-read.mjs');
const OUT = path.resolve(
  HERE,
  '../data/product-truth/dogfood-receipts.gen.json'
);

const counts = new Map<string, number>();
for (const query of DOGFOOD_RECEIPT_QUERIES) {
  const output = execFileSync('node', [PROD_READ, query.sql], {
    encoding: 'utf8',
  });
  counts.set(query.id, parseProdReadCount(output));
}

const file = buildDogfoodReceipts(counts, new Date().toISOString());
writeFileSync(OUT, `${JSON.stringify(file, null, 2)}\n`);
for (const receipt of file.receipts) {
  console.log(`[proof:dogfood] ${receipt.id}: ${receipt.statement}`);
}
const dropped = DOGFOOD_RECEIPT_QUERIES.length - file.receipts.length;
if (dropped > 0)
  console.log(`[proof:dogfood] ${dropped} zero receipt(s) hidden`);
