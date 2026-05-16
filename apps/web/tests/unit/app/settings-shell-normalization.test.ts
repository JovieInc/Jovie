import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function findSourceFile(...candidates: string[]): string | undefined {
  return candidates.find(candidate => existsSync(candidate));
}

const SETTINGS_LAYOUT = findSourceFile(
  resolve(process.cwd(), 'app/app/(shell)/settings/layout.tsx'),
  resolve(process.cwd(), 'apps/web/app/app/(shell)/settings/layout.tsx')
);

const RETARGETING_ROUTE_FILES = [
  findSourceFile(
    resolve(process.cwd(), 'app/app/(shell)/settings/retargeting-ads/page.tsx'),
    resolve(
      process.cwd(),
      'apps/web/app/app/(shell)/settings/retargeting-ads/page.tsx'
    )
  ),
  findSourceFile(
    resolve(
      process.cwd(),
      'app/app/(shell)/settings/retargeting-ads/loading.tsx'
    ),
    resolve(
      process.cwd(),
      'apps/web/app/app/(shell)/settings/retargeting-ads/loading.tsx'
    )
  ),
] as const;

const RETARGETING_ROUTE_CANDIDATES = [
  resolve(process.cwd(), 'app/app/(shell)/settings/retargeting-ads/page.tsx'),
  resolve(
    process.cwd(),
    'app/app/(shell)/settings/retargeting-ads/loading.tsx'
  ),
] as const;

describe('settings shell normalization', () => {
  it('keeps the settings route group as the only PageShell owner', () => {
    expect(SETTINGS_LAYOUT).toBeDefined();

    if (!SETTINGS_LAYOUT) {
      throw new Error('Could not find settings layout source');
    }
    const layoutSource = readFileSync(SETTINGS_LAYOUT, 'utf8');
    expect(layoutSource).toContain('<PageShell');
    expect(layoutSource).toContain("data-testid='settings-shell-content'");
  });

  it('keeps focused settings subroutes inside the parent shell', () => {
    const missingFiles = RETARGETING_ROUTE_FILES.filter(filePath => !filePath);
    expect(missingFiles).toEqual([]);

    for (const filePath of RETARGETING_ROUTE_FILES) {
      if (!filePath) {
        throw new Error(
          `Could not find retargeting settings source. Checked: ${RETARGETING_ROUTE_CANDIDATES.join(', ')}`
        );
      }
      const source = readFileSync(filePath, 'utf8');
      expect(source).not.toMatch(/<PageShell\b/);
      expect(source).not.toMatch(/import\s*\{[^}]*PageShell/);
      expect(source).toMatch(/<PageContent\b/);
    }
  });
});
