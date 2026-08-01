import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(WEB_ROOT, relativePath), 'utf8');
}

describe('Library toolbar layout contract', () => {
  it('keeps preset filters in the shared toolbar scroll rail instead of wrapping', () => {
    const toolbar = read(
      'components/organisms/table/molecules/PageToolbar.tsx'
    );
    const library = read('app/app/(shell)/library/LibrarySurface.tsx');
    const filterChips = library.slice(
      library.indexOf('function LibraryViewFilterChips'),
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
