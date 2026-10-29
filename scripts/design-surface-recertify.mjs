#!/usr/bin/env node
// Post-merge recertification (bot-owned). A PR that changes a certified route's
// source never edits the certification ledger. After merge, this script
// recomputes each stale route's source fingerprint, stores the freshly captured
// screenshots in the evidence store, and writes pointers + the new fingerprint.
// The gate keeps its meaning: a fingerprint is only written together with a
// well-formed capture pointer per viewport, and --strict fails while any
// certified route is stale.
//
// Usage:
//   node scripts/design-surface-recertify.mjs --list-stale
//   node scripts/design-surface-recertify.mjs --captures DIR [--dry-run] [--require-all]
// DIR holds <slug>/<desktop|mobile>.png where slug comes from captureSlug().
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  CERTIFICATIONS_PATH,
  CERTIFICATIONS_SCHEMA,
  checkCensus,
  readCertifications,
  sourceDigest,
  VIEWPORT_WIDTH,
  validateCertificationEntry,
} from './design-surface-census.mjs';
import { buildPointer, uploadObject } from './lib/evidence-store.mjs';

export const CAPTURE_VIEWPORTS = Object.freeze({
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
});

export const captureSlug = source =>
  source
    .replace(/^apps\/web\/app\//, '')
    .replace(/\/page\.[jt]sx?$/, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Routes the producer can reach without a session or fixture data. */
export const capturable = row =>
  !row.route.includes('[') && !row.route.startsWith('/app');

/**
 * @param {{ root?: string, capturesDir?: string, now?: Date,
 *   upload?: (pointer: any, file: string) => void, dryRun?: boolean }} [options]
 */
export function recertify({
  root = process.cwd(),
  capturesDir,
  now = new Date(),
  upload = uploadObject,
  dryRun = false,
} = {}) {
  const { rows, stale } = checkCensus(root, 'origin/main');
  const ledger = readCertifications(root);
  ledger.schema = CERTIFICATIONS_SCHEMA;
  const renewed = [];
  const pending = [];
  for (const source of stale) {
    const row = rows.find(candidate => candidate.source === source);
    const dir = join(capturesDir, captureSlug(source));
    const captures = [];
    for (const [name, size] of Object.entries(CAPTURE_VIEWPORTS)) {
      const file = join(dir, `${name}.png`);
      if (!existsSync(file)) continue;
      const bytes = readFileSync(file);
      const pointer = buildPointer({
        bytes,
        extension: '.png',
        viewport: `${size.width}x${size.height}`,
        capturedAt: now.toISOString(),
        label: `${row.id} ${name}`,
      });
      if (!dryRun) upload(pointer, file);
      captures.push(pointer);
    }
    const entry = {
      sourceDigest: sourceDigest(root, row),
      certifiedAt: now.toISOString(),
      captures,
    };
    try {
      validateCertificationEntry(source, entry, Object.keys(VIEWPORT_WIDTH));
    } catch (error) {
      pending.push({ source, reason: error.message });
      continue;
    }
    ledger.entries[source] = entry;
    renewed.push(source);
  }
  ledger.entries = Object.fromEntries(
    Object.entries(ledger.entries).sort(([a], [b]) => a.localeCompare(b))
  );
  if (!dryRun && renewed.length > 0) {
    const path = join(root, CERTIFICATIONS_PATH);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, `${JSON.stringify(ledger, null, 2)}\n`);
  }
  return { renewed, pending };
}

if (process.argv[1] === import.meta.filename) {
  const args = process.argv.slice(2);
  const value = flag => args[args.indexOf(flag) + 1];
  if (args.includes('--list-stale')) {
    const { rows, stale } = checkCensus(process.cwd(), 'origin/main');
    const list = stale.map(source => {
      const row = rows.find(candidate => candidate.source === source);
      return {
        source,
        route: row.route,
        slug: captureSlug(source),
        capturable: capturable(row),
      };
    });
    console.log(JSON.stringify(list, null, 2));
  } else if (args.includes('--captures')) {
    const result = recertify({
      capturesDir: resolve(value('--captures')),
      dryRun: args.includes('--dry-run'),
    });
    console.log(JSON.stringify(result, null, 2));
    if (args.includes('--require-all') && result.pending.length > 0) {
      process.exitCode = 1;
    }
  } else {
    console.error(
      'Usage: --list-stale | --captures DIR [--dry-run] [--require-all]'
    );
    process.exitCode = 2;
  }
}
