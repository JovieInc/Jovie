import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CUSTOMER_FACING_COPY_FILES = [
  'components/features/auth/AuthUnavailableCard.tsx',
  'app/desktop-auth/page.tsx',
  'app/(auth)/auth/native-complete/page.tsx',
  'components/features/dashboard/organisms/account-settings/SessionManagementCard.tsx',
  'components/features/dashboard/organisms/account-settings/utils.ts',
  '../desktop/src/main.ts',
] as const;

const FORBIDDEN_INTERNAL_VENDOR_TERMS = [
  'Electron',
  'Clerk',
  'Capacitor',
  'React Native',
] as const;

function extractQuotedStrings(source: string): readonly string[] {
  return Array.from(
    source.matchAll(/(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g),
    match => match[2] ?? ''
  );
}

describe('customer-facing vendor copy', () => {
  it('does not expose internal vendor/runtime names in customer-facing strings', () => {
    const offenders = CUSTOMER_FACING_COPY_FILES.flatMap(file => {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      return extractQuotedStrings(source).flatMap(value =>
        FORBIDDEN_INTERNAL_VENDOR_TERMS.filter(term =>
          value.includes(term)
        ).map(term => ({ file, term, value }))
      );
    });

    expect(offenders).toEqual([]);
  });
});
