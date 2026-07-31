import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_PATH = resolve(
  process.cwd(),
  'app/app/(shell)/library/LibrarySurface.tsx'
);

describe('LibrarySurface shared right rail contract', () => {
  it('registers the asset detail drawer with the authenticated shell', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8');

    expect(source).toContain('EntitySidebarShell');
    expect(source).toContain(
      "import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';"
    );
    expect(source).toContain('useRegisterRightPanel(assetDrawerPanel);');
    expect(source).toContain('<EntitySidebarShell');
    expect(source).toContain("ariaLabel='Library asset details'");
    expect(source).toContain("headerMode='minimal'");
    expect(source).toContain("entityHeaderSurface='flat'");
    expect(source).toContain("scrollStrategy='shell'");
    expect(source).toContain("data-testid='library-asset-entity-header'");
  });

  it('does not retain the route-local drawer layout implementation', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8');

    expect(source).not.toContain('libraryGridTemplateColumns');
    expect(source).not.toContain('gridTemplateColumns');
    expect(source).not.toContain('system-b-library-drawer--mobile');
    expect(source).not.toContain('fixed inset-x-3 bottom-20 top-16');
    expect(source).not.toContain('<RightDrawer');
  });
});
