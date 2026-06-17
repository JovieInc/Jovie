import { describe, expect, it } from 'vitest';
import {
  analyzeDesignTasteChangeScope,
  isUiChangedFile,
  resolveAffectedCanonicalSurfaceIds,
} from '@/lib/agent-os/design-taste-jury/change-detection';

describe('design-taste-jury change detection', () => {
  it('skips non-UI pushes', () => {
    const scope = analyzeDesignTasteChangeScope([
      'apps/web/lib/db/client.ts',
      'apps/web/app/api/health/route.ts',
      'docs/TESTING_GUIDELINES.md',
    ]);

    expect(scope.hasUiChanges).toBe(false);
    expect(scope.skipReason).toMatch(/screenshot capture skipped/i);
    expect(scope.affectedCanonicalSurfaceIds).toEqual([]);
  });

  it('maps component edits to affected surfaces without touching unrelated screens', () => {
    const changedFiles = [
      'apps/web/components/features/dashboard/organisms/release-provider-matrix/ReleasesExperience.tsx',
    ];

    const scope = analyzeDesignTasteChangeScope(changedFiles);

    expect(scope.hasUiChanges).toBe(true);
    expect(scope.affectedCanonicalSurfaceIds).toContain('dashboard-releases');
    expect(scope.unchangedSurfaceIds).toContain('homepage');
    expect(scope.unchangedSurfaceIds).toContain('public-profile');
  });

  it('treats global UI changes as all canonical surfaces', () => {
    const affected = resolveAffectedCanonicalSurfaceIds([
      'packages/ui/atoms/Button.tsx',
    ]);

    expect(affected.length).toBeGreaterThan(3);
    expect(affected).toContain('homepage');
    expect(affected).toContain('dashboard-releases');
  });

  it('recognizes UI path prefixes and rejects API-only paths', () => {
    expect(isUiChangedFile('apps/web/components/atoms/Button.tsx')).toBe(true);
    expect(isUiChangedFile('apps/web/app/api/billing/route.ts')).toBe(false);
  });
});
