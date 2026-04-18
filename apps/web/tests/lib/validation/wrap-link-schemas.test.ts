import { describe, expect, it } from 'vitest';
import {
  wrapLinkDeleteSchema,
  wrapLinkPostSchema,
  wrapLinkPutSchema,
} from '@/lib/validation/schemas/wrap-link';

describe('wrapLinkPostSchema', () => {
  it('accepts a valid URL', () => {
    const result = wrapLinkPostSchema.safeParse({
      url: 'https://open.spotify.com/album/abc123',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid URL with optional fields', () => {
    const result = wrapLinkPostSchema.safeParse({
      url: 'https://example.com',
      customAlias: 'my-link',
      expiresInHours: 24,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a private IP URL (SSRF protection)', () => {
    const result = wrapLinkPostSchema.safeParse({
      url: 'http://192.168.1.1/admin',
    });
    expect(result.success).toBe(false);
  });

  it('rejects localhost URL', () => {
    const result = wrapLinkPostSchema.safeParse({
      url: 'http://localhost:3000',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing URL', () => {
    const result = wrapLinkPostSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects customAlias with special characters', () => {
    const result = wrapLinkPostSchema.safeParse({
      url: 'https://example.com',
      customAlias: 'my link!@#',
    });
    expect(result.success).toBe(false);
  });

  it('rejects customAlias exceeding 20 characters (matches resolve path limit)', () => {
    const result = wrapLinkPostSchema.safeParse({
      url: 'https://example.com',
      customAlias: 'a'.repeat(21),
    });
    expect(result.success).toBe(false);
  });

  it('rejects customAlias that is too short', () => {
    const result = wrapLinkPostSchema.safeParse({
      url: 'https://example.com',
      customAlias: 'ab',
    });
    expect(result.success).toBe(false);
  });

  it('rejects expiresInHours exceeding maximum', () => {
    const result = wrapLinkPostSchema.safeParse({
      url: 'https://example.com',
      expiresInHours: 9999,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer expiresInHours', () => {
    const result = wrapLinkPostSchema.safeParse({
      url: 'https://example.com',
      expiresInHours: 1.5,
    });
    expect(result.success).toBe(false);
  });
});

describe('wrapLinkPutSchema', () => {
  it('accepts valid shortId with titleAlias', () => {
    const result = wrapLinkPutSchema.safeParse({
      shortId: 'abc123',
      titleAlias: 'My Link',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing shortId', () => {
    const result = wrapLinkPutSchema.safeParse({
      titleAlias: 'My Link',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty shortId', () => {
    const result = wrapLinkPutSchema.safeParse({
      shortId: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects titleAlias exceeding 200 characters', () => {
    const result = wrapLinkPutSchema.safeParse({
      shortId: 'abc123',
      titleAlias: 'x'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('accepts null expiresAt to clear expiration', () => {
    const result = wrapLinkPutSchema.safeParse({
      shortId: 'abc123',
      expiresAt: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('wrapLinkDeleteSchema', () => {
  it('accepts valid shortId', () => {
    const result = wrapLinkDeleteSchema.safeParse({
      shortId: 'abc123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing shortId', () => {
    const result = wrapLinkDeleteSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects empty shortId', () => {
    const result = wrapLinkDeleteSchema.safeParse({
      shortId: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects shortId exceeding 50 characters', () => {
    const result = wrapLinkDeleteSchema.safeParse({
      shortId: 'x'.repeat(51),
    });
    expect(result.success).toBe(false);
  });
});
