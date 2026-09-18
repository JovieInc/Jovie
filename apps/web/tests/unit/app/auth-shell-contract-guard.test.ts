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

    expect(signin).toContain("layoutVariant='stack'");
    expect(signin).not.toContain("chrome='splash-b'");
    expect(loading).toContain("layoutVariant='stack'");
    expect(modal).toContain('<AuthModalShell');
    expect(modal).not.toContain('<AuthLayout');
  });

  it('keeps signup auth entry on the same signed-in gates as signin (JOV-6450)', () => {
    const signupPage = readFileSync(
      join(process.cwd(), 'app', '(auth)', 'signup', 'page.tsx'),
      'utf8'
    );
    const signupClient = readFileSync(
      join(
        process.cwd(),
        'app',
        '(auth)',
        'signup',
        'SignUpPageClient.tsx'
      ),
      'utf8'
    );
    const signupModalPage = readFileSync(
      join(process.cwd(), 'app', '@auth', '(.)signup', 'page.tsx'),
      'utf8'
    );
    const signupModalClient = readFileSync(
      join(
        process.cwd(),
        'app',
        '@auth',
        '(.)signup',
        'SignupModalClient.tsx'
      ),
      'utf8'
    );
    const authShell = readFileSync(
      join(
        process.cwd(),
        'components',
        'features',
        'auth',
        'AuthShell.tsx'
      ),
      'utf8'
    );
    const entryGuard = readFileSync(
      join(
        process.cwd(),
        'components',
        'features',
        'auth',
        'AuthenticatedAuthEntryGuard.tsx'
      ),
      'utf8'
    );

    expect(signupPage).toContain('resolveUserState');
    expect(signupPage).toContain('getAuthenticatedAuthRouteRedirect');
    expect(signupClient).toContain('<AuthenticatedAuthEntryGuard>');
    expect(signupModalPage).toContain('resolveUserState');
    expect(signupModalPage).toContain('<AuthFormSkeleton');
    expect(signupModalClient).toContain('<AuthenticatedAuthEntryGuard>');
    expect(authShell).not.toContain(
      'if (hasHydrated && isAuthLoaded && isSignedIn)'
    );
    expect(entryGuard).not.toContain('isRedirecting');
    expect(entryGuard).toContain('return children;');
  });
});
