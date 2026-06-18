/**
 * SEO/AEO ratchet guardrail (JovieInc/Jovie#11044).
 *
 * Statically verifies that every route listed in tests/fixtures/seo-ratchet-baseline.json
 * still exports the required metadata signals. The gate HARD-FAILS when a
 * baseline-clean route loses a required tag — matching the perf-ratchet
 * ("once green, never regress") pattern.
 *
 * To add a newly-SEO-clean route: append it to seo-ratchet-baseline.json.
 * To intentionally remove a check from an existing route: update the baseline
 * via PR and document the reason.
 *
 * Checks run against the raw TypeScript/TSX source (no compilation needed):
 *   metadata-export — file exports `metadata` constant or `generateMetadata` fn
 *   description     — file sets `description` in metadata
 *   openGraph       — file references `openGraph:`
 *   twitter         — file references `twitter:`
 *   canonical       — file references `canonical:` or `alternates:`
 *   json-ld         — file emits structured data (`safeJsonLdStringify` or ld+json script)
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(testDir, '..', '..', '..');
const baselineFile = resolve(
  testDir,
  '..',
  '..',
  'fixtures',
  'seo-ratchet-baseline.json'
);

// ---------------------------------------------------------------------------
// Baseline loading
// ---------------------------------------------------------------------------

interface RouteEntry {
  path: string;
  checks: string[];
}

interface Baseline {
  version: number;
  routes: RouteEntry[];
}

const baseline: Baseline = JSON.parse(
  readFileSync(baselineFile, 'utf8')
) as Baseline;

// ---------------------------------------------------------------------------
// Pattern definitions (checked against raw source)
// ---------------------------------------------------------------------------

const CHECK_REMEDIATION: Record<string, string> = {
  'metadata-export':
    'Export `metadata` or `generateMetadata` from the route module (or its metadata builder import).',
  description:
    'Set `description` in the route metadata object (apps/web/lib/profile/metadata.ts for profiles).',
  openGraph: 'Add `openGraph: { ... }` to the route metadata export.',
  twitter: 'Add `twitter: { ... }` to the route metadata export.',
  canonical:
    'Add `alternates: { canonical: ... }` (or `canonical:`) to the route metadata export.',
  'json-ld':
    'Emit JSON-LD via `safeJsonLdStringify()` or a `<script type="application/ld+json">` block.',
};

const CHECK_PATTERNS: Record<string, RegExp> = {
  'metadata-export':
    /export\s+(const\s+metadata\b|async\s+function\s+generateMetadata\b|function\s+generateMetadata\b)/,
  description: /\bdescription\s*[:,]/,
  openGraph: /\bopenGraph\s*:/,
  twitter: /\btwitter\s*:/,
  canonical: /\b(?:canonical\s*:|alternates\s*:)/,
  'json-ld': /safeJsonLdStringify\s*\(|type=['"]application\/ld\+json['"]/,
};

// ---------------------------------------------------------------------------
// Source reader
// ---------------------------------------------------------------------------

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Reads the source of `filePath` and also resolves one level of metadata-
 * specific imports so that routes that delegate to a builder (e.g.
 * `app/[username]/page.tsx` → `lib/profile/metadata.ts`) are still checked.
 * Only follows imports whose specifier path contains "metadata" to avoid
 * resolving large component trees.
 */
function readSourceWithMetadataImports(filePath: string): string {
  if (!isFile(filePath)) return '';
  const source = readFileSync(filePath, 'utf8');

  // Only follow imports that look like metadata-related files
  const importPattern =
    /^(?!.*\bimport\s+type\b)import\s+[\s\S]*?\s+from\s+['"]([.@][^'"]+)['"]/gm;
  let collected = source;

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (!specifier) continue;
    // Only follow imports that look like metadata builders
    if (!specifier.includes('metadata') && !specifier.includes('Metadata')) {
      continue;
    }

    let resolved: string | null = null;

    if (specifier.startsWith('@/')) {
      resolved = resolveFileExtension(join(webRoot, specifier.slice(2)));
    } else if (specifier.startsWith('.')) {
      resolved = resolveFileExtension(join(dirname(filePath), specifier));
    }

    if (resolved) {
      try {
        collected += '\n' + readFileSync(resolved, 'utf8');
      } catch {
        // ignore unreadable files
      }
    }
  }

  return collected;
}

function resolveFileExtension(base: string): string | null {
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ];
  // Never return a directory — only exact file matches
  return candidates.find(c => isFile(c)) ?? null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SEO ratchet baseline', () => {
  it('baseline file is valid and non-empty', () => {
    expect(baseline.version).toBe(1);
    expect(Array.isArray(baseline.routes)).toBe(true);
    expect(baseline.routes.length).toBeGreaterThan(0);
  });

  for (const entry of baseline.routes) {
    const { path: routePath, checks } = entry;
    const filePath = join(webRoot, routePath);

    describe(`route: ${routePath}`, () => {
      it('source file exists', () => {
        expect(
          existsSync(filePath),
          `${routePath} listed in baseline but file not found at ${filePath}`
        ).toBe(true);
      });

      for (const check of checks) {
        it(`has required SEO signal: ${check}`, () => {
          const pattern = CHECK_PATTERNS[check];
          expect(
            pattern,
            `Unknown check "${check}" in baseline — add it to CHECK_PATTERNS`
          ).toBeDefined();

          const source = readSourceWithMetadataImports(filePath);
          const remediation =
            CHECK_REMEDIATION[check] ??
            'Restore the missing SEO signal or update seo-ratchet-baseline.json via intentional PR.';
          expect(
            pattern!.test(source),
            [
              `"${routePath}" is missing required SEO signal: ${check}`,
              `Pattern: ${pattern!.source}`,
              `Auto-fix: ${remediation}`,
              `This route was previously SEO-clean. Either restore the signal or`,
              `intentionally update seo-ratchet-baseline.json via PR.`,
            ].join('\n')
          ).toBe(true);
        });
      }
    });
  }
});
