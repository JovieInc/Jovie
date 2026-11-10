#!/usr/bin/env node
/**
 * node scripts/catalog-duplicate-report.mjs <export.json> [--pretty]
 *
 * Offline duplicate-candidate report over an AUTHORIZED catalog export.
 * This adapter is a JSON-input wrapper around
 * apps/web/lib/discography/release-duplicate-report.ts and nothing else:
 *
 * - No DB client, no network, no credentials.
 * - No mutation mode: there is no --apply flag and the report never merges,
 *   deletes, or rewrites anything. Output is a candidate list for human
 *   review only.
 * - The export must be produced and authorized by Tim. NEVER commit the
 *   export file (or any derived file containing its rows) to the repo.
 *
 * Expected export shape (one JSON object):
 * { "releases": [{ id, profileId, slug, title, releaseDate, upc,
 *                  deletedAt, providers: [{ key, url }],
 *                  tracks?: [{ id, title, isrc }],
 *                  dependents?: { smart_links: 1, ... } }] }
 */
import { readFileSync } from 'node:fs';
import { buildDuplicateReport } from '../apps/web/lib/discography/release-duplicate-report.ts';

function readExport(path) {
  if (!path) {
    console.error(
      'Usage: node scripts/catalog-duplicate-report.mjs <export.json> [--pretty]'
    );
    console.error('Read-only diagnostic. Never commit the export file.');
    process.exit(2);
  }
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw);
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray(parsed.releases)
  ) {
    console.error(
      `Invalid export: expected {"releases": [...]} at the top level (got ${typeof parsed}).`
    );
    process.exit(2);
  }
  return parsed.releases;
}

export function runCatalogDuplicateReport(argv = process.argv.slice(2)) {
  const pretty = argv.includes('--pretty');
  const path = argv.find(arg => arg !== '--pretty');
  const releases = readExport(path);
  const report = buildDuplicateReport({ releases });
  const out = pretty ? JSON.stringify(report, null, 2) : JSON.stringify(report);
  console.log(out);
  return report;
}

if (
  process.argv[1] &&
  process.argv[1].endsWith('catalog-duplicate-report.mjs')
) {
  runCatalogDuplicateReport();
}
