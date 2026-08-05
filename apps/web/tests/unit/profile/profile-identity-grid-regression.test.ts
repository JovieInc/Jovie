import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SURFACE = readFileSync(
  join(
    process.cwd(),
    'components/features/profile/templates/ProfileCompactSurface.tsx'
  ),
  'utf8'
);

describe('public profile identity grid', () => {
  it('uses explicit non-overlapping 44px social targets', () => {
    expect(SURFACE).toContain(
      "'inline-flex h-11 w-11 shrink-0 touch-manipulation"
    );
    expect(SURFACE).toContain(
      'grid shrink-0 auto-cols-[2.75rem] grid-flow-col items-center gap-1'
    );
    expect(SURFACE).not.toMatch(/socialIconClassName\s*=\s*[\s\S]{0,240}-m-2/);
  });

  it('aligns name, metadata, location, and actions to one compact grid', () => {
    expect(SURFACE).toContain('grid min-w-0 gap-1 [overflow-wrap:anywhere]');
    expect(SURFACE).toContain(
      'grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2'
    );
    expect(SURFACE).toContain('inline-flex min-h-11 max-w-full min-w-0');
    expect(SURFACE).toContain('min-h-11 min-w-0 items-center');
  });

  it('keeps long identity values bounded and decorative separators silent', () => {
    expect(SURFACE).toContain('[overflow-wrap:anywhere]');
    expect(SURFACE).toContain("<span className='min-w-0 truncate'>");
    expect(SURFACE).toMatch(
      /rounded-full bg-white\/34'[\s\S]{0,60}aria-hidden='true'/
    );
    expect(SURFACE).toMatch(/<MapPin[\s\S]{0,100}aria-hidden='true'/);
  });
});
