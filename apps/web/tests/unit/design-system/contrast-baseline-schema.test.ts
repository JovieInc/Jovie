/**
 * Contrast baseline schema guard — JOV-#11028
 *
 * Validates that:
 *  1. The contrast-baseline.json file (if it exists) conforms to the expected
 *     ContrastInventory schema — the gate (#11025) can read it safely.
 *  2. The critical high-priority surfaces are represented in the inventory
 *     route list (public profile, onboarding, paywall, dashboard).
 *  3. The bySelector/byComponent indexes are consistent with violations.
 *
 * Run: pnpm --filter web exec vitest run tests/unit/design-system/contrast-baseline-schema.test.ts
 *
 * @see JovieInc/Jovie#11028 (inventory sweep)
 * @see JovieInc/Jovie#11025 (gate that consumes this baseline)
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  buildComponentIndex,
  buildFixClusters,
  buildSelectorIndex,
  type ContrastInventory,
  inferComponentKey,
} from '../../e2e/utils/contrast-inventory';

const WEB_ROOT = process.cwd();
const BASELINE_PATH = join(WEB_ROOT, 'tests/e2e/contrast-baseline.json');
const SPEC_PATH = join(WEB_ROOT, 'tests/e2e/contrast-inventory.spec.ts');

const CRITICAL_ROUTE_CONSTANTS = [
  'APP_ROUTES.LEGACY_DASHBOARD',
  'APP_ROUTES.SETTINGS_BILLING',
  'APP_ROUTES.ONBOARDING',
  'APP_ROUTES.BILLING',
] as const;

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

function isIndexEntry(
  entry: unknown
): entry is ContrastInventory['bySelector'][string] {
  if (typeof entry !== 'object' || entry === null) return false;
  const o = entry as Record<string, unknown>;
  return (
    typeof o['count'] === 'number' &&
    Array.isArray(o['routes']) &&
    Array.isArray(o['themes']) &&
    typeof o['sampleSelector'] === 'string'
  );
}

function isFixCluster(
  cluster: unknown
): cluster is ContrastInventory['fixClusters'][number] {
  if (typeof cluster !== 'object' || cluster === null) return false;
  const o = cluster as Record<string, unknown>;
  return (
    typeof o['componentKey'] === 'string' &&
    typeof o['count'] === 'number' &&
    Array.isArray(o['routes']) &&
    Array.isArray(o['themes']) &&
    (o['priority'] === 'critical' ||
      o['priority'] === 'high' ||
      o['priority'] === 'normal') &&
    typeof o['suggestedIssueTitle'] === 'string' &&
    typeof o['sampleSelector'] === 'string'
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
    o['bySelector'] !== null &&
    typeof o['byComponent'] === 'object' &&
    o['byComponent'] !== null &&
    Array.isArray(o['fixClusters']) &&
    (o['fixClusters'] as unknown[]).every(isFixCluster) &&
    Object.values(o['bySelector'] as Record<string, unknown>).every(
      isIndexEntry
    ) &&
    Object.values(o['byComponent'] as Record<string, unknown>).every(
      isIndexEntry
    )
  );
}

describe('Contrast baseline schema (JOV-#11028)', () => {
  it('contrast-inventory.spec.ts must include all critical authenticated routes', () => {
    expect(existsSync(SPEC_PATH), 'contrast-inventory.spec.ts must exist').toBe(
      true
    );

    const specSource = readFileSync(SPEC_PATH, 'utf8');

    for (const routeConstant of CRITICAL_ROUTE_CONSTANTS) {
      expect(
        specSource,
        `contrast-inventory.spec.ts must include critical route constant "${routeConstant}"`
      ).toContain(routeConstant);
    }

    expect(APP_ROUTES.LEGACY_DASHBOARD).toBe('/app/dashboard');
    expect(APP_ROUTES.BILLING).toBe('/billing');
  });

  it('contrast-inventory.spec.ts must cover both light and dark themes', () => {
    const src = readFileSync(SPEC_PATH, 'utf8');
    expect(src, 'spec must cover light theme').toContain("'light'");
    expect(src, 'spec must cover dark theme').toContain("'dark'");
  });

  it('contrast-inventory.spec.ts must use axe color-contrast rule exclusively', () => {
    const src = readFileSync(SPEC_PATH, 'utf8');
    expect(src, 'spec must use color-contrast axe rule').toContain(
      "withRules(['color-contrast'])"
    );
  });

  it('contrast-inventory.spec.ts must not use import.meta.url (breaks Playwright loader)', () => {
    const src = readFileSync(SPEC_PATH, 'utf8');
    expect(src, 'import.meta.url breaks Playwright ESM loading').not.toContain(
      'import.meta.url'
    );
  });

  it('component inference groups token classes for shared fixes', () => {
    const key = inferComponentKey(
      'button.text-tertiary-token.bg-surface-1.rounded-full'
    );
    expect(key).toBe('.bg-surface-1 .text-tertiary-token');
  });

  it('inventory indexes stay consistent for synthetic violations', () => {
    const violations: ContrastInventory['violations'] = [
      {
        route: '/billing',
        theme: 'dark',
        ruleId: 'color-contrast',
        impact: 'serious',
        nodes: [
          {
            selector: 'button.text-tertiary-token',
            failureSummary: 'Fix contrast',
            data: {
              fgColor: '#666',
              bgColor: '#000',
              contrastRatio: 2.1,
              expectedContrastRatio: 4.5,
            },
          },
        ],
      },
      {
        route: '/onboarding',
        theme: 'light',
        ruleId: 'color-contrast',
        impact: 'serious',
        nodes: [
          {
            selector: 'button.text-tertiary-token',
            failureSummary: 'Fix contrast',
            data: {
              fgColor: '#777',
              bgColor: '#fff',
              contrastRatio: 2.4,
              expectedContrastRatio: 4.5,
            },
          },
        ],
      },
    ];

    const bySelector = buildSelectorIndex(violations);
    const byComponent = buildComponentIndex(violations);
    const fixClusters = buildFixClusters(byComponent);

    expect(bySelector['button.text-tertiary-token']?.count).toBe(2);
    expect(byComponent['.text-tertiary-token']?.count).toBe(2);
    expect(fixClusters[0]?.priority).toBe('critical');
    expect(fixClusters[0]?.routes).toEqual(
      expect.arrayContaining(['/billing', '/onboarding'])
    );
  });

  it('baseline schema is valid when the file exists', () => {
    if (!existsSync(BASELINE_PATH)) {
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

    const computedTotal = inventory.violations.reduce(
      (sum, v) => sum + v.nodes.length,
      0
    );
    const indexedSelectorTotal = Object.values(inventory.bySelector).reduce(
      (sum, s) => sum + s.count,
      0
    );
    const indexedComponentTotal = Object.values(inventory.byComponent).reduce(
      (sum, s) => sum + s.count,
      0
    );

    expect(
      inventory.totalViolations,
      'totalViolations must equal sum of violation nodes'
    ).toBe(computedTotal);
    expect(
      indexedSelectorTotal,
      'bySelector count sum must equal totalViolations'
    ).toBe(computedTotal);
    expect(
      indexedComponentTotal,
      'byComponent count sum must equal totalViolations'
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
      'byComponent',
      'fixClusters',
    ] as const;

    for (const field of requiredFields) {
      expect(
        field in inventory,
        `contrast-baseline.json must have field "${field}"`
      ).toBe(true);
    }
  });
});
