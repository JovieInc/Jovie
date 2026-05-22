import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isSameOriginApiRequest,
  shouldAttachCsrfHeader,
} from '@/lib/security/csrf';

describe('csrf helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('recognizes same-origin API requests', () => {
    const origin = globalThis.location?.origin;

    expect(typeof origin).toBe('string');
    expect(isSameOriginApiRequest('/api/stripe/checkout')).toBe(true);
    expect(shouldAttachCsrfHeader('/api/stripe/checkout', 'POST')).toBe(true);
  });

  it('fails closed when location origin is missing', () => {
    vi.stubGlobal('location', { origin: undefined } as Location);

    expect(isSameOriginApiRequest('/api/stripe/checkout')).toBe(false);
    expect(shouldAttachCsrfHeader('/api/stripe/checkout', 'POST')).toBe(false);
  });

  it('fails closed when URL parsing throws', () => {
    expect(isSameOriginApiRequest('http://[::1')).toBe(false);
    expect(shouldAttachCsrfHeader('http://[::1', 'POST')).toBe(false);
  });
});
