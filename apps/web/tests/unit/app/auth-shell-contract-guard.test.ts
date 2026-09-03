import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const AUTH_ROUTE_FILES = [
  {
    entry: join(process.cwd(), 'app', '(auth)', 'signin', 'page.tsx'),
    shell: join(
      process.cwd(),
      'app',
      '(auth)',
      'signin',
      'SignInPageClient.tsx'
    ),
  },
  {
    entry: join(process.cwd(), 'app', '(auth)', 'signup', 'page.tsx'),
    shell: join(
      process.cwd(),
      'app',
      '(auth)',
      'signup',
      'SignUpPageClient.tsx'
    ),
  },
  { entry: join(process.cwd(), 'app', '(auth)', 'signin', 'loading.tsx') },
  { entry: join(process.cwd(), 'app', '(auth)', 'signup', 'loading.tsx') },
] as const;

describe('auth shell contract guard', () => {
  it('keeps auth route entrypoints on AuthLayout-owned shell primitives', () => {
    const offenders = AUTH_ROUTE_FILES.filter(({ entry, shell }) => {
      const contents = readFileSync(entry, 'utf8');
      const shellContents =
        shell === undefined ? '' : readFileSync(shell, 'utf8');

      if (
        !contents.includes('<AuthLayout') &&
        !shellContents.includes('<AuthLayout') &&
        !contents.includes('AuthPageSkeleton')
      ) {
        return true;
      }

      return contents.includes('fixed inset-0');
    });

    expect(offenders).toEqual([]);
  });

  it('keeps the sign-in full route on the desktop split shell', () => {
    const signin = readFileSync(
      join(process.cwd(), 'app', '(auth)', 'signin', 'SignInPageClient.tsx'),
      'utf8'
    );
    const loading = readFileSync(
      join(process.cwd(), 'app', '(auth)', 'signin', 'loading.tsx'),
      'utf8'
    );
    const modal = readFileSync(
      join(process.cwd(), 'app', '@auth', '(.)signin', 'SigninModalClient.tsx'),
      'utf8'
    );

    expect(signin).toContain("layoutVariant='split'");
    expect(signin).not.toContain("chrome='splash-b'");
    expect(loading).toContain("layoutVariant='split'");
    expect(modal).toContain('<AuthModalShell');
    expect(modal).not.toContain('<AuthLayout');
  });
});
