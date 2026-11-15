#!/usr/bin/env node
// Combine the shard receipts of one sharded product crawl into the single
// receipt, verdict and summary a full crawl writes. Usage:
//   node scripts/product-crawl/merge-receipts.mjs --out <dir> <shard dir>...
// Each shard dir holds that shard's receipt.json. A missing or extra shard,
// or shards of different builds, fail the merge rather than read as ready.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { productReady } from './ready-gate.mjs';
import { mergeReceipts, summaryLines } from './shard.mjs';

const { values: args, positionals: dirs } = parseArgs({
  allowPositionals: true,
  options: { out: { type: 'string', default: 'product-crawl-receipt' } },
});

const receipts = await Promise.all(
  dirs.map(async d =>
    JSON.parse(await readFile(join(d, 'receipt.json'), 'utf8'))
  )
);
const receipt = mergeReceipts(receipts);
const verdict = productReady(receipt);
const lines = summaryLines(receipt, verdict);
await mkdir(args.out, { recursive: true });
await writeFile(
  join(args.out, 'receipt.json'),
  JSON.stringify(receipt, null, 1)
);
await writeFile(
  join(args.out, 'verdict.json'),
  JSON.stringify(verdict, null, 1)
);
await writeFile(join(args.out, 'summary.md'), lines.join('\n'));
console.log(lines.join('\n'));
// Exit 0 like the crawl: ready-gate.mjs decides, the receipt still uploads.
