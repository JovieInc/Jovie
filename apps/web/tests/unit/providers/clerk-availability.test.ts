import { afterEach, describe, expect, it } from 'vitest';
import {
  getClerkProxyUrl,
  isMockPublishableKey,
  shouldBypassClerk,
} from '@/components/providers/clerkAvailability';

const originalWindow = globalThis.window;

function setTestWindow(hostname: string) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: {
      location: {
        hostname,
      },
    },
  });
}

describe('clerkAvailability', () => {
  afterEach(() => {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        writable: true,
        value: originalWindow,
      });
      return;
    }

    Reflect.deleteProperty(globalThis, 'window');
  });

  it('bypasses Clerk for whitespace-only publishable keys', () => {
    expect(shouldBypassClerk('   ', '0')).toBe(true);
  });

  it('treats placeholder publishable keys as mocked', () => {
    expect(isMockPublishableKey('mock-publishable-key')).toBe(true);
    expect(isMockPublishableKey('dummy')).toBe(true);
    expect(isMockPublishableKey('pk_test_example')).toBe(false);
  });

  it('does not use the Clerk proxy on IPv6 localhost', () => {
    setTestWindow('::1');

    expect(getClerkProxyUrl()).toBeUndefined();
  });

  it('does not use the Clerk proxy on bracketed IPv6 localhost', () => {
    setTestWindow('[::1]');

    expect(getClerkProxyUrl()).toBeUndefined();
  });
});
