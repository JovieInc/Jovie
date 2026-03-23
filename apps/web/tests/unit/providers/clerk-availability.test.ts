import { afterEach, describe, expect, it } from 'vitest';
import {
  getClerkProxyUrl,
  shouldBypassClerk,
} from '@/components/providers/clerkAvailability';

const originalWindow = globalThis.window;

describe('clerkAvailability', () => {
  afterEach(() => {
    if (originalWindow) {
      globalThis.window = originalWindow;
      return;
    }

    Reflect.deleteProperty(globalThis, 'window');
  });

  it('bypasses Clerk for whitespace-only publishable keys', () => {
    expect(shouldBypassClerk('   ', '0')).toBe(true);
  });

  it('does not use the Clerk proxy on IPv6 localhost', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          hostname: '::1',
        },
      },
    });

    expect(getClerkProxyUrl()).toBeUndefined();
  });
});
