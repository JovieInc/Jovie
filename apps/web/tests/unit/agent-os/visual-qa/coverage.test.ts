import { describe, expect, it } from 'vitest';
import { MARKETING_EXACT_PUBLIC_ROUTE_TARGETS } from '@/data/marketing';
import {
  assertVisualQaCoverageManifest,
  getVisualQaCoverageEntry,
  getVisualQaCoverageForCaptureSurface,
  MARKETING_EXACT_ROUTE_VISUAL_QA_ENTRIES,
  VISUAL_QA_COVERAGE_MANIFEST,
  validateVisualQaCoverageManifest,
} from '@/lib/agent-os/visual-qa/coverage';

describe('visual QA coverage manifest', () => {
  it('passes its structural validation and keeps ids unique', () => {
    expect(validateVisualQaCoverageManifest()).toEqual([]);
    expect(() => assertVisualQaCoverageManifest()).not.toThrow();

    const entryIds = VISUAL_QA_COVERAGE_MANIFEST.entries.map(entry => entry.id);
    expect(new Set(entryIds).size).toBe(entryIds.length);
  });

  it('records native/device gaps as unavailable with reasons', () => {
    const unavailable = VISUAL_QA_COVERAGE_MANIFEST.entries.filter(
      entry => entry.availability === 'unavailable'
    );

    expect(unavailable.length).toBeGreaterThan(0);
    expect(
      unavailable.every(
        entry =>
          entry.unavailableReason && entry.source.kind === 'native-device'
      )
    ).toBe(true);
  });

  it('links route, snapshot, and existing Visual QA sources', () => {
    expect(getVisualQaCoverageEntry('web-public-homepage')?.source.kind).toBe(
      'playwright-route'
    );
    expect(getVisualQaCoverageEntry('web-admin-overview')?.source.kind).toBe(
      'playwright-snapshot'
    );
    expect(getVisualQaCoverageForCaptureSurface('shell-desktop-idle')?.id).toBe(
      'web-app-shell-desktop'
    );
  });

  it('registers dynamic masks and locked regions without changing UI source', () => {
    const auth = getVisualQaCoverageEntry('web-auth-signin');
    const homepage = getVisualQaCoverageEntry('web-public-homepage');

    expect(auth?.dynamicMasks.map(mask => mask.id)).toEqual([
      'clerk-csrf-inputs',
      'clerk-time-fields',
    ]);
    expect(homepage?.lockedRegions[0]).toMatchObject({
      id: 'marketing-header',
      x: 0,
      y: 0,
      width: 1,
    });
  });

  it('enrolls every exact marketing route at desktop and mobile with capture-time proof metadata', () => {
    expect(MARKETING_EXACT_ROUTE_VISUAL_QA_ENTRIES).toHaveLength(
      MARKETING_EXACT_PUBLIC_ROUTE_TARGETS.length * 2
    );

    for (const target of MARKETING_EXACT_PUBLIC_ROUTE_TARGETS) {
      const entries = MARKETING_EXACT_ROUTE_VISUAL_QA_ENTRIES.filter(
        entry =>
          entry.source.kind === 'playwright-route' &&
          entry.source.sourcePath === target.sourcePath
      );
      expect(entries.map(entry => entry.fixtureId)).toEqual([
        'web-chromium-1440x900',
        'web-chromium-390x844',
      ]);
      for (const entry of entries) {
        expect(entry.source).toMatchObject({
          route: target.fixturePath,
          fixturePath: target.fixturePath,
          expectedPath: target.expectedPath,
          waitFor: target.expectedRuntimeSelector,
          expectedRuntimeSelector: target.expectedRuntimeSelector,
          sourceSha: 'capture-time-git-sha',
          stateMatrix: target.stateMatrix,
        });
        expect(entry.qualityChecks).toEqual([
          'accessibility',
          'console-errors',
          'focus-visible',
          'horizontal-overflow',
          'layout-stability',
          'reduced-motion',
        ]);
      }
    }
  });
});
