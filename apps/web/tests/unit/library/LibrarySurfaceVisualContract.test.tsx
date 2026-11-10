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

  it('joins the toolbar text tools to the desktop density (one bar, one height)', () => {
    const source = readSurfaceSource();

    // The Add primary pill and the YouTube Ledger ghost control both carry
    // the same desktop density as the icon cluster they sit beside; YouTube
    // Ledger also steps up to text-secondary so it reads as a control.
    expect(source).toContain(
      'className={LIBRARY_DESKTOP_CONTROL_DENSITY_CLASS}'
    );
    expect(source).toContain('LIBRARY_DESKTOP_CONTROL_DENSITY_CLASS,');
    expect(source).toContain("'text-secondary-token'");
  });
});
