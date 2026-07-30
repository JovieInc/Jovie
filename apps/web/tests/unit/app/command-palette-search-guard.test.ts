import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');

function readSource(path: string): string {
  return readFileSync(join(ROOT, path), 'utf-8');
}

describe('command palette search shell guard', () => {
  it('swaps the active route for the main-plane command surface', () => {
    const source = readSource('components/organisms/AuthShellWrapper.tsx');

    expect(source).not.toMatch(/import\s+\{\s*HeaderSearchSurface\s*\}\s+from/);
    expect(source).not.toContain('<HeaderSearchSurface');
    expect(source).not.toContain('stopImmediatePropagation');
    expect(source).not.toContain('headerSearchSurface=');
    expect(source).not.toContain('isHeaderSearchActive=');
    expect(source).toContain('CommandPaletteMainSurface');
    expect(source).toContain('isCommandPaletteOpen');
  });

  it('keeps the compact Search trigger in the canonical sidebar only', () => {
    const authShell = readSource('components/organisms/AuthShell.tsx');
    const sidebar = readSource('components/organisms/UnifiedSidebar.tsx');
    const navigation = readSource(
      'components/features/dashboard/dashboard-nav/DashboardNav.tsx'
    );

    expect(authShell).not.toContain('HeaderSearchSurfaceFromContext');
    expect(authShell).not.toContain('useOptionalHeaderActions');
    expect(authShell).not.toContain('searchSurface=');
    expect(authShell).not.toContain('isSearchActive=');
    expect(sidebar).toContain('HeaderSearchSurfaceFromContext');
    expect(sidebar).toMatch(
      /<DashboardNav>[\s\S]*?<HeaderSearchSurfaceFromContext[\s\S]*?<\/DashboardNav>/
    );
    expect(navigation).toContain("data-sidebar-search-slot='true'");
    expect(authShell).toContain('commandPaletteHeader');
  });

  it('keeps Search out of duplicate navigation rows', () => {
    const source = readSource(
      'components/features/dashboard/dashboard-nav/DashboardNav.tsx'
    );

    expect(source).not.toContain('openHeaderSearch');
    expect(source).not.toContain("name: 'Search'");
    expect(source).not.toContain("name='Search'");
    expect(source).not.toContain('openCommandPalette');
    expect(source).not.toContain('globalThis.dispatchEvent');
    expect(source).not.toMatch(
      /new\s+Event\(\s*OPEN_COMMAND_PALETTE_EVENT\s*\)/
    );
  });

  it('keeps the sidebar trigger local while cmdk owns debounced remote search', () => {
    const connectorSource = readSource(
      'components/shell/HeaderSearchSurfaceFromContext.tsx'
    );
    const clientSource = readSource('components/shell/header-search-client.ts');

    expect(connectorSource).not.toContain('useReleasesQuery');
    expect(connectorSource).not.toContain('loadReleaseMatrix');
    expect(connectorSource).toContain('openCommandPalette');
    expect(clientSource).toContain('/api/search/header');
    expect(clientSource).toContain('signal');
    expect(readSource('components/organisms/CmdKPalette.tsx')).toContain(
      "presentation === 'main'"
    );
  });
});
