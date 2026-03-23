import { describe, expect, it } from 'vitest';
import {
  getClerkProxyUrl,
  isMockPublishableKey,
  shouldBypassClerk,
} from '@/components/providers/clerkAvailability';

describe('clerkAvailability', () => {
  it('bypasses Clerk for whitespace-only publishable keys', () => {
    expect(shouldBypassClerk('   ', '0')).toBe(true);
  });

  it('accepts whitespace-padded valid publishable keys', () => {
    expect(shouldBypassClerk('  pk_test_example  ', '0')).toBe(false);
  });

  it('treats non-Clerk publishable keys as mocked', () => {
    expect(isMockPublishableKey('mock-publishable-key')).toBe(true);
    expect(isMockPublishableKey('dummy')).toBe(true);
    expect(isMockPublishableKey('pk_test_example')).toBe(false);
  });

  it('always uses the Clerk proxy', () => {
    expect(getClerkProxyUrl()).toBe('/clerk');
  });
});
