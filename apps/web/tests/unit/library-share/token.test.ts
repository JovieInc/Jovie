import { describe, expect, it, vi } from 'vitest';
import { generateLibraryShareDropToken } from '@/lib/library-share/token';

describe('generateLibraryShareDropToken', () => {
  it('preserves standard base64url characters in an exact 144-bit token', () => {
    const randomBytesSource = vi.fn(() =>
      Buffer.from([
        0xfb, 0xff, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ])
    );

    const token = generateLibraryShareDropToken(randomBytesSource);

    expect(randomBytesSource).toHaveBeenCalledWith(18);
    expect(token).toBe('-___AAAAAAAAAAAAAAAAAAAA');
    expect(token).toMatch(/^[A-Za-z0-9_-]{24}$/);
  });
});
