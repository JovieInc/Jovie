import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Work-surface visual-contract pins (founder notes 2026-11-09), kept in
 * their own file so LibrarySurface.test.tsx stays on its size-500 baseline.
 * These are source-contract asserts over the LibrarySurface source, the same
 * style the file's existing source-contract tests use.
 */
const LIBRARY_SURFACE_SOURCE = 'app/app/(shell)/library/LibrarySurface.tsx';

function readSurfaceSource(): string {
  return readFileSync(resolve(process.cwd(), LIBRARY_SURFACE_SOURCE), 'utf8');
}

describe('LibrarySurface visual contract', () => {
  it('keeps grid card titles on a two-line clamp instead of mid-word single-line cuts', () => {
    const source = readSurfaceSource();

    const titleBlock = source.match(
      /<h2 className='system-b-library-card-title[^']*'>/
    );
    expect(titleBlock).not.toBeNull();
    expect(titleBlock?.[0]).toContain('line-clamp-2');
    expect(titleBlock?.[0]).not.toContain('truncate');
  });

  it('keeps inspector rows on one 24px rhythm — approval editor and destinations included', () => {
    const source = readSurfaceSource();

    // The Button atom pins min-h-7 on sm, which silently out-voted the
    // approval trigger's h-6 and made the Review Status row 30px against
    // its 24px neighbours.
    expect(source).toContain(
      "'-ml-1 inline-flex h-6 min-h-6 max-w-full items-center justify-start gap-1 truncate px-1 font-normal text-primary-token hover:bg-surface-1 disabled:opacity-100',"
    );
    // Destinations rows ride the same 24px rhythm as the property rows
    // around them (DspQuietRow defaults to min-h-8).
    expect(source).toContain(
      "className='system-b-library-provider-link min-h-6'"
    );
  });

  it('rides the app-wide 28px toolbar scale with no local density overrides', () => {
    const source = readSurfaceSource();

    // One bar, one height: the 32px local density is retired (the icon
    // squares keep their 28px w-7 track); text tools ride the canonical
    // PAGE_TOOLBAR_ACTION_BUTTON_CLASS.
    expect(source).not.toContain('h-8 min-h-8');
    expect(source).toContain(
      "const LIBRARY_DESKTOP_ICON_CONTROL_DENSITY_CLASS = 'w-7 min-w-7';"
    );
    expect(source).toContain('className={PAGE_TOOLBAR_ACTION_BUTTON_CLASS}');
  });
});
