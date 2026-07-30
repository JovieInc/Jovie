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

    expect(source).toContain(
      "import { RightDrawer } from '@/components/organisms/RightDrawer';"
    );
    expect(source).toContain(
      "import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';"
    );
    expect(source).toContain('useRegisterRightPanel(assetDrawerPanel);');
    expect(source).toContain('<RightDrawer');
    expect(source).toContain("ariaLabel='Library asset details'");
    expect(source).toContain(
      "className='flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'"
    );
  });

  it('does not retain the route-local drawer layout implementation', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8');

    expect(source).not.toContain('libraryGridTemplateColumns');
    expect(source).not.toContain('gridTemplateColumns');
    expect(source).not.toContain('system-b-library-drawer--mobile');
    expect(source).not.toContain('fixed inset-x-3 bottom-20 top-16');
  });
});
