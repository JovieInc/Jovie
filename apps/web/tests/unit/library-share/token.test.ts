import { describe, expect, it } from 'vitest';
import { generateLibraryShareDropToken } from '@/lib/library-share/token';

describe('generateLibraryShareDropToken', () => {
  it('returns a stable-length opaque token', () => {
    const token = generateLibraryShareDropToken();
    expect(token.length).toBeGreaterThanOrEqual(16);
    expect(token).toMatch(/^[a-zA-Z0-9]+$/);
  });
});
