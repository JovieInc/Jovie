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

  it('keeps AuthShell from forwarding header search props into DashboardHeader', () => {
    const source = readSource('components/organisms/AuthShell.tsx');

    expect(source).not.toContain('headerSearchSurface');
    expect(source).not.toContain('isHeaderSearchActive');
    expect(source).not.toContain('searchSurface=');
    expect(source).not.toContain('isSearchActive=');
  });

  it('keeps DashboardNav Search wired to the command palette event', () => {
    const source = readSource(
      'components/features/dashboard/dashboard-nav/DashboardNav.tsx'
    );

    expect(source).toContain('OPEN_COMMAND_PALETTE_EVENT');
    expect(source).toContain('globalThis.dispatchEvent');
    expect(source).toMatch(/new\s+Event\(\s*OPEN_COMMAND_PALETTE_EVENT\s*\)/);
  });
});
