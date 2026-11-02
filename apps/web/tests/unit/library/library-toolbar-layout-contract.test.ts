import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(WEB_ROOT, relativePath), 'utf8');
}

describe('Library toolbar layout contract', () => {
  it('keeps filter navigation separate from the legacy releases surface alias', () => {
    const library = read('app/app/(shell)/library/LibrarySurface.tsx');
    const handler = library.slice(
      library.indexOf('const handlePresetChange ='),
      library.indexOf('const handleStageChange =')
    );

    // A type filter must never emit the URL that unmounts the toolbar.
    expect(handler).not.toMatch(/params\.set\('view'/u);
    expect(handler).toContain("params.set('preset', next)");
    expect(handler).toContain("params.delete('preset')");
    expect(handler).toContain("params.delete('view')");
    expect(handler).toContain('{ scroll: false }');
  });

  it('keeps preset filters in the shared toolbar scroll rail instead of wrapping', () => {
    const toolbar = read(
      'components/organisms/table/molecules/PageToolbar.tsx'
    );
    const library = read('app/app/(shell)/library/LibrarySurface.tsx');
    const filterChips = library.slice(
      library.indexOf('function LibraryStageTabs'),
      library.indexOf('function LibrarySavedViewRow')
    );

    expect(toolbar).toContain('overflow-x-auto overflow-y-hidden');
    expect(filterChips).toContain(
      "className='flex shrink-0 flex-nowrap items-center gap-1'"
    );
    expect(filterChips).not.toContain(
      "className='flex min-w-0 flex-wrap items-center gap-1'"
    );
  });
});
