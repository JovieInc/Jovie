import { describe, expect, it, vi } from 'vitest';
import { simpleEncryptUrl } from '@/lib/utils/url-encryption';
import {
  decryptUrlRawKey,
  encryptUrlRawKey,
  type RawKeyEncryptionResult,
} from '@/lib/utils/url-encryption.server';

const DEV_FALLBACK_KEY_SYMBOL = Symbol.for(
  'jovie.url-encryption.dev-fallback-key'
);

type UrlEncryptionGlobal = typeof globalThis & {
  [DEV_FALLBACK_KEY_SYMBOL]?: string;
};

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

  it('falls back to an ephemeral key in test env when URL_ENCRYPTION_KEY is unset', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalEncryptionKey = process.env.URL_ENCRYPTION_KEY;

    try {
      process.env.NODE_ENV = 'test';
      delete process.env.URL_ENCRYPTION_KEY;

      vi.resetModules();

      const {
        decryptUrlRawKey: decryptWithFallbackKey,
        encryptUrlRawKey: encryptWithFallbackKey,
      } = await import('@/lib/utils/url-encryption.server');

      const url = 'https://example.com/test-fallback';
      const encrypted = encryptWithFallbackKey(url);

      expect(decryptWithFallbackKey(encrypted)).toBe(url);
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }

      if (originalEncryptionKey === undefined) {
        delete process.env.URL_ENCRYPTION_KEY;
      } else {
        process.env.URL_ENCRYPTION_KEY = originalEncryptionKey;
      }

      vi.resetModules();
    }
  });

  it('reuses the fallback key across module reloads in the same process', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalEncryptionKey = process.env.URL_ENCRYPTION_KEY;
    const globalWithFallback = globalThis as UrlEncryptionGlobal;
    const originalFallbackKey = globalWithFallback[DEV_FALLBACK_KEY_SYMBOL];

    try {
      process.env.NODE_ENV = 'test';
      delete process.env.URL_ENCRYPTION_KEY;
      delete globalWithFallback[DEV_FALLBACK_KEY_SYMBOL];

      vi.resetModules();
      const firstModule = await import('@/lib/utils/url-encryption.server');
      const encrypted = firstModule.encryptUrlRawKey(
        'https://example.com/reload-stable'
      );

      vi.resetModules();
      const secondModule = await import('@/lib/utils/url-encryption.server');

      expect(secondModule.decryptUrlRawKey(encrypted)).toBe(
        'https://example.com/reload-stable'
      );
      expect(globalWithFallback[DEV_FALLBACK_KEY_SYMBOL]).toBeTruthy();
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }

      if (originalEncryptionKey === undefined) {
        delete process.env.URL_ENCRYPTION_KEY;
      } else {
        process.env.URL_ENCRYPTION_KEY = originalEncryptionKey;
      }

      if (originalFallbackKey === undefined) {
        delete globalWithFallback[DEV_FALLBACK_KEY_SYMBOL];
      } else {
        globalWithFallback[DEV_FALLBACK_KEY_SYMBOL] = originalFallbackKey;
      }

      vi.resetModules();
    }
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
