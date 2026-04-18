import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getBaseUrl,
  isPreview,
  isProduction,
} from '@/lib/utils/platform-detection/environment';

function stubBrowserLocation(hostname: string, port: string = ''): void {
  const location = {
    protocol: 'https:',
    hostname,
    port,
  };

  vi.stubGlobal('location', location);
  vi.stubGlobal('window', { location });
}

describe('platform-detection environment', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses staging.jov.ie as the browser base URL', () => {
    stubBrowserLocation('staging.jov.ie');

    expect(getBaseUrl()).toBe('https://staging.jov.ie');
    expect(isPreview()).toBe(true);
    expect(isProduction()).toBe(false);
  });

  it('keeps recognizing the legacy main.jov.ie staging host', () => {
    stubBrowserLocation('main.jov.ie');

    expect(getBaseUrl()).toBe('https://main.jov.ie');
    expect(isPreview()).toBe(true);
    expect(isProduction()).toBe(false);
  });

  it('treats jov.ie as production in the browser', () => {
    stubBrowserLocation('jov.ie');

    expect(getBaseUrl()).toBe('https://jov.ie');
    expect(isPreview()).toBe(false);
    expect(isProduction()).toBe(true);
  });
});
