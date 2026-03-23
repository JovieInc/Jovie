import { describe, expect, it } from 'vitest';
import { simpleEncryptUrl } from '@/lib/utils/url-encryption';
import {
  decryptUrlRawKey,
  encryptUrlRawKey,
  type RawKeyEncryptionResult,
} from '@/lib/utils/url-encryption.server';

describe('Raw-key AES-256-GCM URL encryption', () => {
  it('encrypts and decrypts a URL round-trip', () => {
    const url = 'https://open.spotify.com/album/abc123';
    const encrypted = encryptUrlRawKey(url);
    const decrypted = decryptUrlRawKey(encrypted);
    expect(decrypted).toBe(url);
  });

  it('produces a versioned envelope with v: 1', () => {
    const encrypted = encryptUrlRawKey('https://example.com');
    expect(encrypted.v).toBe(1);
    expect(encrypted.encrypted).toBeTruthy();
    expect(encrypted.iv).toBeTruthy();
    expect(encrypted.authTag).toBeTruthy();
  });

  it('produces different ciphertext for the same URL (random IV)', () => {
    const url = 'https://example.com/same';
    const a = encryptUrlRawKey(url);
    const b = encryptUrlRawKey(url);
    expect(a.iv).not.toBe(b.iv);
    expect(a.encrypted).not.toBe(b.encrypted);
  });

  it('throws on corrupted/tampered encrypted data', () => {
    const encrypted = encryptUrlRawKey('https://example.com');
    const tampered: RawKeyEncryptionResult = {
      ...encrypted,
      encrypted: 'deadbeef',
    };
    expect(() => decryptUrlRawKey(tampered)).toThrow();
  });

  it('throws on missing required fields', () => {
    expect(() =>
      decryptUrlRawKey({ v: 1, encrypted: '', iv: '', authTag: '' })
    ).toThrow();
  });
});

describe('Legacy base64 format detection', () => {
  it('legacy base64 strings are not valid JSON with v field', () => {
    const legacy = simpleEncryptUrl('https://example.com');

    // Legacy base64 should NOT parse as JSON with a v field
    let parsed: RawKeyEncryptionResult | null = null;
    try {
      parsed = JSON.parse(legacy) as RawKeyEncryptionResult;
    } catch {
      // Expected — base64 is not valid JSON
    }

    // Either parsing failed or it doesn't have v: 1
    const isLegacy = !parsed || parsed.v !== 1 || !parsed.iv || !parsed.authTag;
    expect(isLegacy).toBe(true);
  });

  it('new encrypted format is valid JSON with v: 1', () => {
    const encrypted = encryptUrlRawKey('https://example.com');
    const json = JSON.stringify(encrypted);
    const parsed = JSON.parse(json) as RawKeyEncryptionResult;
    expect(parsed.v).toBe(1);
    expect(parsed.iv).toBeTruthy();
    expect(parsed.authTag).toBeTruthy();
  });
});
