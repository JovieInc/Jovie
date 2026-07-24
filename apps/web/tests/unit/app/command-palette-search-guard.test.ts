import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');

function readSource(path: string): string {
  return readFileSync(join(ROOT, path), 'utf-8');
}

describe('command palette search shell guard', () => {
  it('keeps AuthShellWrapper out of the header search surface path', () => {
    const source = readSource('components/organisms/AuthShellWrapper.tsx');

    expect(source).not.toMatch(/import\s+\{\s*HeaderSearchSurface\s*\}\s+from/);
    expect(source).not.toContain('<HeaderSearchSurface');
    expect(source).not.toContain('stopImmediatePropagation');
    expect(source).not.toContain('headerSearchSurface=');
    expect(source).not.toContain('isHeaderSearchActive=');
  });

  it('keeps AuthShell owning the shared header search surface', () => {
    const source = readSource('components/organisms/AuthShell.tsx');

    expect(source).not.toContain('headerSearchSurface');
    expect(source).not.toContain('isHeaderSearchActive');
    expect(source).toContain('HeaderSearchSurfaceFromContext');
    expect(source).toContain('useOptionalHeaderActions');
    expect(source).toContain('searchSurface={searchSurface}');
    expect(source).toContain(
      'isSearchActive={headerActionsState?.isSearchOpen ?? false}'
    );
  });

  it('keeps DashboardNav Search wired to the command palette event', () => {
    const source = readSource(
      'components/features/dashboard/dashboard-nav/DashboardNav.tsx'
    );

    expect(source).toContain('openCommandPalette');
    expect(source).not.toContain('globalThis.dispatchEvent');
    expect(source).not.toMatch(
      /new\s+Event\(\s*OPEN_COMMAND_PALETTE_EVENT\s*\)/
    );
  });
});
