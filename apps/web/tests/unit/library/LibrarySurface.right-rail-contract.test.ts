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

    expect(source).toContain('InspectorShell');
    expect(source).toContain(
      "import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';"
    );
    expect(source).toContain('useRegisterRightPanel(assetDrawerPanel);');
    expect(source).toContain('<InspectorShell');
    expect(source).toContain("ariaLabel='Work details'");
    expect(source).toContain('WORK_INSPECTOR_TABS');
    expect(source).not.toContain('LIBRARY_INSPECTOR_TABS');
    expect(source).not.toContain("'details'");
    expect(source).not.toContain('Press Kit Drop');
    expect(source).toContain("data-testid='library-asset-entity-header'");
    expect(source).not.toContain('DrawerSectionGroup');
    expect(source).not.toContain('<DrawerSection');
    expect(source).toContain("finding.subjectType !== 'artist'");
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
