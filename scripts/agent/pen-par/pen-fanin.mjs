#!/usr/bin/env node
// pen-fanin.mjs <input.pen> <run.pen> [run.pen ...]
// Fan-in guard: prints added / removed / changed / reflowed top-level frames per run as JSON.
// Exits 2 if any run removed or semantically changed a pre-existing frame.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { diffDocs } from './pen-par-lib.mjs';

const [srcPath, ...runs] = process.argv.slice(2);
if (!srcPath || runs.length === 0) {
  console.error('usage: pen-fanin.mjs <input.pen> <run.pen> [run.pen ...]');
  process.exit(64);
}
/** @param {string} p */
const load = p => JSON.parse(readFileSync(p, 'utf8'));
const src = load(srcPath);
const results = runs.map(p => ({
  run: basename(p),
  ...diffDocs(src, load(p)),
}));
console.log(JSON.stringify(results, null, 2));
process.exit(results.every(r => r.ok) ? 0 : 2);
