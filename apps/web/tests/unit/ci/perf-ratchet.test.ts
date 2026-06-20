/**
 * Performance ratchet guardrail (JovieInc/Jovie#10938).
 *
 * Works → Fast → Instant: surfaces at "instant" tier are locked — loosening
 * budgets or dropping Lighthouse assertions hard-fails CI. iOS god-view line
 * ceilings and PerformanceBudgets constants are checked the same way.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  END_USER_PERF_ROUTE_MANIFEST,
  getRouteTimingBudgets,
} from '../../../scripts/performance-route-manifest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const baselinePath = resolve(
  repoRoot,
  'docs/performance/perf-ratchet-baseline.json'
);
const iosRoot = resolve(repoRoot, 'apps/ios/Jovie');

interface PerfRatchetBaseline {
  version: number;
  webVitals: {
    inp_ms: number;
    lcp_ms: number;
    cls: number;
    initialJS_gzip_kb: number;
  };
  ios: {
    coldLaunch_ms: number;
    hitchRate_ms_per_s: number;
    maxFrame_ms: number;
    shellTransition_ms: number;
    dashboardFiles: Record<string, number>;
  };
  surfaces: Array<{
    id: string;
    platform: 'ios' | 'web';
    tier: 'fast' | 'instant' | 'works';
    lighthouseConfigs?: string[];
    routeManifestIds?: string[];
  }>;
}

const baseline = JSON.parse(
  readFileSync(baselinePath, 'utf8')
) as PerfRatchetBaseline;

function readSourceLines(relativePath: string) {
  const filePath = join(iosRoot, relativePath);
  const source = readFileSync(filePath, 'utf8');
  return source.split('\n').length;
}

function extractLighthouseAssertions(configPath: string) {
  const absolutePath = resolve(repoRoot, configPath);
  const config = JSON.parse(readFileSync(absolutePath, 'utf8')) as {
    ci?: {
      assert?: {
        assertMatrix?: Array<{
          assertions?: Record<
            string,
            string | [string, { maxNumericValue?: number; minScore?: number }]
          >;
        }>;
      };
    };
  };

  const merged: Record<string, [string, { maxNumericValue?: number }]> = {};
  for (const matrix of config.ci?.assert?.assertMatrix ?? []) {
    for (const [key, value] of Object.entries(matrix.assertions ?? {})) {
      if (
        Array.isArray(value) &&
        typeof value[1]?.maxNumericValue === 'number'
      ) {
        merged[key] = value as [string, { maxNumericValue: number }];
      }
    }
  }
  return merged;
}

function readPerformanceBudgetConstant(name: string) {
  const source = readFileSync(
    join(iosRoot, 'Core/PerformanceBudgets.swift'),
    'utf8'
  );
  const match = source.match(
    new RegExp(`static let ${name}\\s*=\\s*([0-9_.,]+)`)
  );
  expect(match, `Missing PerformanceBudgets.${name}`).toBeTruthy();
  return Number(match![1]!.replaceAll('_', '').replaceAll(',', ''));
}

describe('perf ratchet baseline', () => {
  it('baseline file is valid', () => {
    expect(baseline.version).toBe(1);
    expect(baseline.surfaces.length).toBeGreaterThan(0);
  });

  it('iOS PerformanceBudgets match ratchet baseline', () => {
    expect(readPerformanceBudgetConstant('coldLaunchMilliseconds')).toBe(
      baseline.ios.coldLaunch_ms
    );
    expect(
      readPerformanceBudgetConstant('hitchRateMillisecondsPerSecond')
    ).toBe(baseline.ios.hitchRate_ms_per_s);
    expect(readPerformanceBudgetConstant('maxFrameMilliseconds')).toBe(
      baseline.ios.maxFrame_ms
    );
    expect(readPerformanceBudgetConstant('shellTransitionMilliseconds')).toBe(
      baseline.ios.shellTransition_ms
    );
  });

  it('iOS dashboard files stay decomposed under line ceilings', () => {
    for (const [fileName, maxLines] of Object.entries(
      baseline.ios.dashboardFiles
    )) {
      const lineCount = readSourceLines(`Features/Dashboard/${fileName}`);
      expect(
        lineCount,
        `${fileName} grew to ${lineCount} lines (max ${maxLines})`
      ).toBeLessThanOrEqual(maxLines);
      expect(existsSync(join(iosRoot, 'Features/Dashboard', fileName))).toBe(
        true
      );
    }
  });

  for (const surface of baseline.surfaces.filter(s => s.platform === 'web')) {
    describe(`web surface: ${surface.id} (${surface.tier})`, () => {
      for (const configPath of surface.lighthouseConfigs ?? []) {
        it(`${configPath} enforces LCP/CLS/INP budgets`, () => {
          const assertions = extractLighthouseAssertions(configPath);

          if (surface.tier === 'instant') {
            const lcp =
              assertions['largest-contentful-paint']?.[1]?.maxNumericValue;
            const cls =
              assertions['cumulative-layout-shift']?.[1]?.maxNumericValue;
            const inp =
              assertions['interaction-to-next-paint']?.[1]?.maxNumericValue;

            expect(
              lcp,
              `${configPath} must lock LCP for instant tier`
            ).toBeLessThanOrEqual(baseline.webVitals.lcp_ms);
            expect(
              cls,
              `${configPath} must lock CLS for instant tier`
            ).toBeLessThanOrEqual(baseline.webVitals.cls);
            expect(
              inp,
              `${configPath} must lock INP for instant tier`
            ).toBeLessThanOrEqual(baseline.webVitals.inp_ms);
          }
        });
      }

      for (const routeId of surface.routeManifestIds ?? []) {
        it(`route manifest ${routeId} stays within ratchet budgets`, () => {
          const route = END_USER_PERF_ROUTE_MANIFEST.find(
            entry => entry.id === routeId
          );
          expect(route, `Unknown route id ${routeId}`).toBeDefined();

          const timings = getRouteTimingBudgets(route!);
          const lcp = timings.find(
            entry => entry.metric === 'largest-contentful-paint'
          )?.budget;
          const cls = timings.find(
            entry => entry.metric === 'cumulative-layout-shift'
          )?.budget;
          const fid = timings.find(
            entry => entry.metric === 'first-input-delay'
          )?.budget;

          if (surface.tier === 'instant') {
            expect(lcp).toBeLessThanOrEqual(baseline.webVitals.lcp_ms);
            expect(cls).toBeLessThanOrEqual(baseline.webVitals.cls);
            expect(fid).toBeLessThanOrEqual(baseline.webVitals.inp_ms);
          }
        });
      }
    });
  }
});
