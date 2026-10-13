import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as zodMini from 'zod/mini';

// patches/zod@4.6.7.patch drops the `locales` namespace re-exports. Turbopack
// cannot shake the `z` namespace, so they shipped ~39 KB gzip of translated
// error strings in every client route that imports zod. Locales stay
// importable from `zod/locales` when a caller needs one.
describe('zod locales patch', () => {
  it('keeps every locale out of the zod namespaces', () => {
    expect('locales' in z).toBe(false);
    expect('locales' in z.core).toBe(false);
    expect('locales' in zodMini).toBe(false);
  });

  it('keeps the default English error messages', () => {
    const result = z.object({ name: z.string() }).safeParse({ name: 1 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      'Invalid input: expected string, received number'
    );
  });

  it('still serves explicit locale imports', async () => {
    const locales = await import('zod/locales');
    expect(typeof locales.de).toBe('function');
  });
});
