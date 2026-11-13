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
 *   deletes, or rewrites anything. Unknown flags (including --apply) are
 *   rejected, not silently ignored. Output is a candidate list for human
 *   review only.
 * - Every input row is validated before reporting: nonempty release/profile
 *   IDs, required string/null fields, provider-link shape, and valid
 *   optional inventory/count fields. A malformed export exits nonzero with
 *   a row-indexed error instead of grouping incomplete identities.
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

const KNOWN_FLAGS = new Set(['--pretty']);

export function parseArgs(argv) {
  const flags = [];
  const positional = [];
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      if (!KNOWN_FLAGS.has(arg)) {
        throw new Error(
          `Unknown flag: ${arg}. Supported flags: ${[...KNOWN_FLAGS].join(', ')}. This tool has no mutation mode.`
        );
      }
      flags.push(arg);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length !== 1) {
    throw new Error(
      `Expected exactly one export path argument, got ${positional.length}.`
    );
  }
  return { path: positional[0], pretty: flags.includes('--pretty') };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonemptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function stringOrNull(value) {
  return value === null || typeof value === 'string';
}

function failRow(index, message) {
  throw new Error(`Invalid export row ${index}: ${message}`);
}

/**
 * Validate one export row by row. Throws with the offending row index on the
 * first invalid field, so an incomplete identity never silently enters a
 * profile bucket and invents a cross-profile collision.
 */
export function validateExportRows(releases) {
  if (!Array.isArray(releases)) {
    throw new Error(
      `Invalid export: expected {"releases": [...]} (got ${typeof releases}).`
    );
  }
  for (const [index, row] of releases.entries()) {
    if (!isPlainObject(row)) failRow(index, 'row is not an object');
    if (!nonemptyString(row.id)) failRow(index, 'id must be a nonempty string');
    if (!nonemptyString(row.profileId)) {
      failRow(
        index,
        'profileId must be a nonempty string — rows without a profile cannot be scoped and are rejected rather than grouped'
      );
    }
    if (!nonemptyString(row.slug)) {
      failRow(index, 'slug must be a nonempty string');
    }
    if (typeof row.title !== 'string' || row.title.length === 0) {
      failRow(index, 'title must be a nonempty string');
    }
    for (const field of ['releaseDate', 'upc', 'deletedAt']) {
      if (!stringOrNull(row[field])) {
        failRow(index, `${field} must be a string or null`);
      }
    }
    if (!Array.isArray(row.providers)) {
      failRow(index, 'providers must be an array');
    }
    for (const [pIndex, provider] of row.providers.entries()) {
      if (!isPlainObject(provider)) {
        failRow(index, `providers[${pIndex}] is not an object`);
      }
      if (!nonemptyString(provider.key)) {
        failRow(index, `providers[${pIndex}].key must be a nonempty string`);
      }
      if (typeof provider.url !== 'string') {
        failRow(index, `providers[${pIndex}].url must be a string`);
      }
    }
    if (row.tracks !== undefined) {
      if (!Array.isArray(row.tracks)) {
        failRow(index, 'tracks must be an array when present');
      }
      for (const [tIndex, track] of row.tracks.entries()) {
        if (!isPlainObject(track)) {
          failRow(index, `tracks[${tIndex}] is not an object`);
        }
        if (!nonemptyString(track.id)) {
          failRow(index, `tracks[${tIndex}].id must be a nonempty string`);
        }
        if (typeof track.title !== 'string') {
          failRow(index, `tracks[${tIndex}].title must be a string`);
        }
        if (!stringOrNull(track.isrc)) {
          failRow(index, `tracks[${tIndex}].isrc must be a string or null`);
        }
      }
    }
    if (row.dependents !== undefined) {
      if (!isPlainObject(row.dependents)) {
        failRow(index, 'dependents must be an object when present');
      }
      for (const [resource, count] of Object.entries(row.dependents)) {
        if (!nonemptyString(resource) || resource.startsWith('--')) {
          failRow(index, `dependents key "${resource}" is not a resource name`);
        }
        if (
          typeof count !== 'number' ||
          !Number.isInteger(count) ||
          count < 0
        ) {
          failRow(
            index,
            `dependents["${resource}"] must be a nonnegative integer (got ${JSON.stringify(count)})`
          );
        }
      }
    }
  }
  return releases;
}

function readExport(path) {
  const raw = readFileSync(path, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Export is not valid JSON: ${error.message}`);
  }
  if (!isPlainObject(parsed) || !('releases' in parsed)) {
    throw new Error(
      'Invalid export: expected {"releases": [...]} at the top level.'
    );
  }
  return parsed.releases;
}

export function runCatalogDuplicateReport(argv = process.argv.slice(2)) {
  const { path, pretty } = parseArgs(argv);
  const releases = validateExportRows(readExport(path));
  const report = buildDuplicateReport({ releases });
  const out = pretty ? JSON.stringify(report, null, 2) : JSON.stringify(report);
  console.log(out);
  return report;
}

if (
  process.argv[1] &&
  process.argv[1].endsWith('catalog-duplicate-report.mjs')
) {
  try {
    runCatalogDuplicateReport();
  } catch (error) {
    console.error(`catalog-duplicate-report: ${error.message}`);
    console.error('Read-only diagnostic. Never commit the export file.');
    process.exit(2);
  }
}
