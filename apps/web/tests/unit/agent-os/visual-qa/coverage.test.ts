import { describe, expect, it } from 'vitest';
import {
  assertVisualQaCoverageManifest,
  getVisualQaCoverageEntry,
  getVisualQaCoverageForCaptureSurface,
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
});
