#!/usr/bin/env node
/**
 *   node scripts/sources-of-truth.mjs [--write]
 * Validates canon/sources-of-truth.json (every owner and derived path exists,
 * one owner per domain) and checks that canon/SOURCES_OF_TRUTH.md is the
 * rendered map. --write regenerates the markdown.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readSourcesOfTruth,
  renderSourcesOfTruth,
  SOT_DOC_PATH,
  validateSourcesOfTruth,
} from './lib/sources-of-truth.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const map = readSourcesOfTruth(root);
const problems = validateSourcesOfTruth(map, root);
const rendered = renderSourcesOfTruth(map);
const docPath = resolve(root, SOT_DOC_PATH);
if (process.argv.includes('--write')) writeFileSync(docPath, rendered);
else {
  let current = '';
  try {
    current = readFileSync(docPath, 'utf8');
  } catch {}
  if (current !== rendered)
    problems.push(
      `${SOT_DOC_PATH} is stale; run node scripts/sources-of-truth.mjs --write`
    );
}
if (problems.length) {
  for (const p of problems) console.error(`sources-of-truth: ${p}`);
  process.exit(1);
}
console.log(
  `sources-of-truth: ${map.domains.length} domains, each with one owner.`
);
