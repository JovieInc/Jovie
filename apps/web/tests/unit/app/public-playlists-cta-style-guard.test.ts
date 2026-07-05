import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/(dynamic)/playlists/[slug]/page.tsx', 'utf8');

describe('public playlist CTA style guard', () => {
  it('keeps the Spotify open action neutral with provider color only on the icon', () => {
    expect(source).not.toContain('rounded-full bg-[#1DB954]');
    expect(source).not.toContain('transition-opacity hover:opacity-90');
    expect(source).toContain('rounded-full bg-white');
    expect(source).toContain(
      'text-black dark:text-white transition-colors hover:bg-white dark:bg-surface-1/90'
    );
    expect(source).toContain("className='h-5 w-5 text-[#1DB954]'");
  });
});
