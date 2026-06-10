import { describe, expect, it } from 'vitest';
import {
  hashLibrarySharePassphrase,
  verifyLibrarySharePassphrase,
} from '@/lib/library-share/passphrase';

describe('library share passphrase', () => {
  it('hashes and verifies matching passphrases', () => {
    const stored = hashLibrarySharePassphrase('label-review-2026');
    expect(verifyLibrarySharePassphrase('label-review-2026', stored)).toBe(
      true
    );
    expect(verifyLibrarySharePassphrase('wrong-passphrase', stored)).toBe(
      false
    );
  });
});
