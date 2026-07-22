import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function findSourceFile(...candidates: string[]): string {
  const found = candidates.find(candidate => existsSync(candidate));
  if (!found) {
    throw new Error(
      `Could not find source file. Checked: ${candidates.join(', ')}`
    );
  }
  return found;
}

const FEATURE_FLAGS_PAGE = findSourceFile(
  resolve(process.cwd(), 'app/app/(shell)/feature-flags/page.tsx'),
  resolve(process.cwd(), 'apps/web/app/app/(shell)/feature-flags/page.tsx')
);
const ADMIN_FEATURES_PAGE = findSourceFile(
  resolve(process.cwd(), 'app/app/(shell)/admin/features/page.tsx'),
  resolve(process.cwd(), 'apps/web/app/app/(shell)/admin/features/page.tsx')
);
const ROUTES_SOURCE = findSourceFile(
  resolve(process.cwd(), 'constants/routes.ts'),
  resolve(process.cwd(), 'apps/web/constants/routes.ts')
);

describe('feature flags shell normalization', () => {
  it('keeps the old feature-flags path as a deliberate redirect', () => {
    const source = readFileSync(FEATURE_FLAGS_PAGE, 'utf8');
    const routesSource = readFileSync(ROUTES_SOURCE, 'utf8');

    expect(source).toContain('redirect(APP_ROUTES.ADMIN_FEATURES)');
    expect(routesSource).toContain(
      "LEGACY_FEATURE_FLAGS: '/app/feature-flags'"
    );
    expect(source).not.toContain('FeatureFlagsTable');
    expect(source).not.toContain('loadAppShellRouteContext');
    expect(source).not.toContain('getCurrentUserEntitlements');
  });

  it('keeps the canonical operational feature-flags surface under admin', () => {
    const source = readFileSync(ADMIN_FEATURES_PAGE, 'utf8');

    expect(source).toContain('AdminFeaturesTable');
    expect(source).toContain("testId='admin-features-page'");
    expect(source).toContain("title='Features'");
  });
});
