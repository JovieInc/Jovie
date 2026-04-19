import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const AUTH_ROUTE_FILES = [
  join(process.cwd(), 'app', '(auth)', 'signin', 'page.tsx'),
  join(process.cwd(), 'app', '(auth)', 'signup', 'page.tsx'),
  join(process.cwd(), 'app', '(auth)', 'signup', 'SignUpPageClient.tsx'),
  join(process.cwd(), 'app', '(auth)', 'signin', 'loading.tsx'),
  join(process.cwd(), 'app', '(auth)', 'signup', 'loading.tsx'),
] as const;

describe('auth shell contract guard', () => {
  it('keeps auth route entrypoints on AuthLayout-owned shell primitives', () => {
    const offenders = AUTH_ROUTE_FILES.filter(filePath => {
      const contents = readFileSync(filePath, 'utf8');

      if (
        !contents.includes('<AuthLayout') &&
        !contents.includes('AuthPageSkeleton') &&
        !contents.includes('SignUpPageClient')
      ) {
        return true;
      }

      return contents.includes('fixed inset-0');
    });

    expect(offenders).toEqual([]);
  });
});
