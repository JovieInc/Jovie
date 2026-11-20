#!/usr/bin/env node
/**
 * The one list of paths PR Size Guard does not count. Shared by the source
 * guard (pr-size-guard.yml), the integration-train override
 * (pr-size-guard-label-override.yml) and the merge-group member policy, which
 * each carried their own copy before.
 *
 * Two families are excluded:
 * - generated, lock, snapshot and vendored noise (unchanged since the guard
 *   was introduced);
 * - tests and fixtures (2026-10-31). The coverage floors demand tests and the
 *   size cap used to punish them: #23956 crossed 1500 lines only because it
 *   added the tests its 90% coverage gate required. The cap now applies to
 *   production code. The repository-hygiene byte and path budgets still apply
 *   to every file. Rule note: .claude/rules/testing.md ("PR size counts
 *   production code").
 *
 * CLI: reads "<lines>\t<path>" rows on stdin and prints only the counted rows.
 */
import { pathToFileURL } from 'node:url';

export const GENERATED_SIZE_EXCLUSION =
  /pnpm-lock\.yaml|package-lock\.json|yarn\.lock|\.lock$|\/generated\/|\.gen\.|__snapshots__\/|\.snap$|\.svg$|\.po$|\/dist\/|\/build\/|\.min\.|drizzle\/migrations\/meta\//;

// Test sources and their fixtures in every language the repo ships:
// foo.test.ts / foo.spec.mjs, __tests__/ and fixtures/ directories,
// pytest test_*.py and *_test.py, and Swift XCTest *Tests.swift.
export const TEST_SIZE_EXCLUSION =
  /(?:^|\/)[^/]+\.(?:test|spec)\.[^/]+$|(?:^|\/)__tests__\/|(?:^|\/)(?:__)?fixtures(?:__)?\/|(?:^|\/)test_[^/]+\.py$|(?:^|\/)[^/]+_test\.py$|(?:^|\/)[^/]+Tests\.swift$/;

/** True when a changed path does not count toward the PR size cap. */
export function isSizeExcluded(path) {
  if (typeof path !== 'string' || path === '') return false;
  return GENERATED_SIZE_EXCLUSION.test(path) || TEST_SIZE_EXCLUSION.test(path);
}

/** Keep only counted "<lines>\t<path>" rows; blank rows are dropped. */
export function filterCountedRows(text) {
  return text
    .split('\n')
    .filter(row => {
      if (!row) return false;
      const tab = row.indexOf('\t');
      if (tab < 0) throw new Error(`unparseable size row: ${row}`);
      return !isSizeExcluded(row.slice(tab + 1));
    })
    .join('\n');
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const kept = filterCountedRows(Buffer.concat(chunks).toString('utf8'));
  process.stdout.write(kept ? `${kept}\n` : '');
}
