/**
 * Contrast baseline schema guard — JOV-#11028
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  buildComponentIndex,
  buildFixClusters,
  buildSelectorIndex,
  type ContrastInventory,
  inferComponentKey,
  isContrastInventory,
  resetContrastScreenshotDirectory,
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

describe('Contrast baseline schema (JOV-#11028)', () => {
  it('contrast-inventory.spec.ts covers critical routes, themes, and axe rule', () => {
    expect(existsSync(SPEC_PATH)).toBe(true);
    const specSource = readFileSync(SPEC_PATH, 'utf8');

    for (const routeConstant of CRITICAL_ROUTE_CONSTANTS) {
      expect(specSource).toContain(routeConstant);
    }

    expect(specSource).toContain("'light'");
    expect(specSource).toContain("'dark'");
    expect(specSource).toContain("withRules(['color-contrast'])");
    expect(specSource).not.toContain('import.meta.url');
    expect(APP_ROUTES.LEGACY_DASHBOARD).toBe('/app/dashboard');
    expect(APP_ROUTES.BILLING).toBe('/billing');
  });

  it('component inference groups token classes for shared fixes', () => {
    expect(
      inferComponentKey('button.text-tertiary-token.bg-surface-1.rounded-full')
    ).toBe('.bg-surface-1 .text-tertiary-token');
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
    if (!existsSync(BASELINE_PATH)) return;

    const parsed: unknown = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
    expect(isContrastInventory(parsed)).toBe(true);

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

    expect(inventory.totalViolations).toBe(computedTotal);
    expect(indexedSelectorTotal).toBe(computedTotal);
    expect(indexedComponentTotal).toBe(computedTotal);
  });

  it('resets only the owned screenshot directory and refuses symlinks', () => {
    const root = mkdtempSync(
      join(realpathSync(os.tmpdir()), 'contrast-inventory-')
    );
    const screenshotDir = join(root, 'contrast-screenshots');
    const outsideDir = join(root, 'outside');
    const outsideSentinel = join(outsideDir, 'sentinel.txt');

    try {
      mkdirSync(screenshotDir);
      mkdirSync(outsideDir);
      writeFileSync(join(screenshotDir, 'stale.png'), 'stale');
      writeFileSync(outsideSentinel, 'keep');

      expect(resetContrastScreenshotDirectory(root)).toBe(screenshotDir);
      expect(existsSync(join(screenshotDir, 'stale.png'))).toBe(false);
      expect(readFileSync(outsideSentinel, 'utf8')).toBe('keep');

      rmSync(screenshotDir, { recursive: true });
      symlinkSync(outsideDir, screenshotDir, 'dir');
      expect(() => resetContrastScreenshotDirectory(root)).toThrow(
        'refuses to replace a symlinked output root'
      );
      expect(readFileSync(outsideSentinel, 'utf8')).toBe('keep');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    'live',
    'dangling',
  ] as const)('refuses a %s symlinked ancestor without deleting outside files', symlinkType => {
    const root = mkdtempSync(
      join(realpathSync(os.tmpdir()), 'contrast-ancestor-')
    );
    const lexicalRoot = join(root, 'lexical');
    const outsideDir = join(root, 'outside');
    const outsideSentinel = join(outsideDir, 'sentinel.txt');

    try {
      mkdirSync(lexicalRoot);
      mkdirSync(outsideDir);
      writeFileSync(outsideSentinel, 'keep');
      const linkedAncestor = join(lexicalRoot, 'tests');
      symlinkSync(
        symlinkType === 'live' ? outsideDir : join(root, 'missing'),
        linkedAncestor,
        'dir'
      );
      const outputRoot = join(linkedAncestor, 'e2e');

      expect(() => resetContrastScreenshotDirectory(outputRoot)).toThrow(
        'resolves outside its lexical root'
      );
      expect(readFileSync(outsideSentinel, 'utf8')).toBe('keep');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
