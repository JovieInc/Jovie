/**
 * Contrast baseline schema guard — JOV-#11028
 *
 * Validates that:
 *  1. The contrast-baseline.json file (if it exists) conforms to the expected
 *     ContrastInventory schema — the gate (#11025) can read it safely.
 *  2. The critical high-priority surfaces are represented in the inventory
 *     route list (public profile, onboarding, paywall, dashboard).
 *  3. The bySelector index is consistent with the violations array.
 *
 * This test:
 *  - PASSES when the baseline file doesn't exist yet (first run before sweep).
 *  - FAILS if the baseline file is malformed after a sweep.
 *  - FAILS if required critical routes are missing from the sweep route list
 *    defined in contrast-inventory.spec.ts.
 *
 * Run: pnpm --filter web exec vitest run tests/unit/design-system/contrast-baseline-schema.test.ts
 *
 * @see JovieInc/Jovie#11028 (inventory sweep)
 * @see JovieInc/Jovie#11025 (gate that consumes this baseline)
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ContrastInventory } from '../../e2e/contrast-inventory.spec';

const WEB_ROOT = process.cwd();
const BASELINE_PATH = join(WEB_ROOT, 'tests/e2e/contrast-baseline.json');

// Routes that MUST be present in the sweep — highest-priority per #11028
const CRITICAL_ROUTE_PREFIXES = [
  '/app/dashboard',
  '/app/settings/billing',
  '/onboarding',
  '/app/upgrade',
] as const;

// ---------------------------------------------------------------------------
// Schema validators
// ---------------------------------------------------------------------------

function isContrastNode(
  n: unknown
): n is ContrastInventory['violations'][number]['nodes'][number] {
  if (typeof n !== 'object' || n === null) return false;
  const o = n as Record<string, unknown>;
  return (
    typeof o['selector'] === 'string' && typeof o['failureSummary'] === 'string'
  );
}

function isContrastViolationRecord(
  v: unknown
): v is ContrastInventory['violations'][number] {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o['route'] === 'string' &&
    (o['theme'] === 'light' || o['theme'] === 'dark') &&
    typeof o['ruleId'] === 'string' &&
    Array.isArray(o['nodes']) &&
    (o['nodes'] as unknown[]).every(isContrastNode)
  );
}

function isContrastInventory(data: unknown): data is ContrastInventory {
  if (typeof data !== 'object' || data === null) return false;
  const o = data as Record<string, unknown>;
  return (
    o['schemaVersion'] === 1 &&
    o['issueRef'] === '#11028' &&
    typeof o['generatedAt'] === 'string' &&
    typeof o['totalViolations'] === 'number' &&
    Array.isArray(o['violations']) &&
    (o['violations'] as unknown[]).every(isContrastViolationRecord) &&
    typeof o['bySelector'] === 'object' &&
    o['bySelector'] !== null
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Contrast baseline schema (JOV-#11028)', () => {
  it('contrast-inventory.spec.ts must include all critical authenticated routes', () => {
    // This test validates the source file, not the generated baseline —
    // it fails even before a sweep runs, ensuring the spec is complete.
    const specPath = join(WEB_ROOT, 'tests/e2e/contrast-inventory.spec.ts');
    expect(existsSync(specPath), 'contrast-inventory.spec.ts must exist').toBe(
      true
    );

    const specSource = readFileSync(specPath, 'utf8');

    for (const prefix of CRITICAL_ROUTE_PREFIXES) {
      expect(
        specSource,
        `contrast-inventory.spec.ts must include critical route "${prefix}"`
      ).toContain(`'${prefix}'`);
    }
  });

  it('contrast-inventory.spec.ts must cover both light and dark themes', () => {
    const specPath = join(WEB_ROOT, 'tests/e2e/contrast-inventory.spec.ts');
    const src = readFileSync(specPath, 'utf8');
    expect(src, 'spec must cover light theme').toContain("'light'");
    expect(src, 'spec must cover dark theme').toContain("'dark'");
  });

  it('contrast-inventory.spec.ts must use axe color-contrast rule exclusively', () => {
    const specPath = join(WEB_ROOT, 'tests/e2e/contrast-inventory.spec.ts');
    const src = readFileSync(specPath, 'utf8');
    expect(src, 'spec must use color-contrast axe rule').toContain(
      "withRules(['color-contrast'])"
    );
  });

  it('baseline schema is valid when the file exists', () => {
    if (!existsSync(BASELINE_PATH)) {
      // Not yet generated — skip gracefully (first run before sweep)
      return;
    }

    const raw = readFileSync(BASELINE_PATH, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(
        `contrast-baseline.json is not valid JSON: ${BASELINE_PATH}`
      );
    }

    expect(
      isContrastInventory(parsed),
      'contrast-baseline.json must conform to ContrastInventory schema'
    ).toBe(true);

    const inventory = parsed as ContrastInventory;

    // bySelector count consistency: sum of node counts across all violations
    // must match totalViolations
    const computedTotal = inventory.violations.reduce(
      (sum, v) => sum + v.nodes.length,
      0
    );
    const indexedTotal = Object.values(inventory.bySelector).reduce(
      (sum, s) => sum + s.count,
      0
    );
    expect(
      inventory.totalViolations,
      'totalViolations must equal sum of violation nodes'
    ).toBe(computedTotal);
    expect(
      indexedTotal,
      'bySelector count sum must equal totalViolations'
    ).toBe(computedTotal);
  });

  it('baseline covers all schemaVersion=1 required fields', () => {
    if (!existsSync(BASELINE_PATH)) return;

    const inventory = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Record<
      string,
      unknown
    >;
    const requiredFields = [
      'schemaVersion',
      'generatedAt',
      'issueRef',
      'totalViolations',
      'violations',
      'bySelector',
    ] as const;

    for (const field of requiredFields) {
      expect(
        field in inventory,
        `contrast-baseline.json must have field "${field}"`
      ).toBe(true);
    }
  });
});
