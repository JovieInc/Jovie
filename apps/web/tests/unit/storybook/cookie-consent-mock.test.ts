import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  blockStoredConsentRead,
  readConsent,
  saveConsent,
  setStorybookConsentSave,
} from '@/.storybook/cookie-consent-mock';

const WEB_ROOT = path.resolve(__dirname, '../../..');
const consent = { essential: true, analytics: false, marketing: false };

function read(relativePath: string): string {
  return readFileSync(path.resolve(WEB_ROOT, relativePath), 'utf8');
}

describe('cookie consent Storybook mock', () => {
  afterEach(() => localStorage.clear());

  it('exports every runtime name the real module exports', async () => {
    const names = [
      ...read('lib/cookies/consent.ts').matchAll(
        /^export (?:async )?(?:function|const) (\w+)/gm
      ),
    ].map(match => match[1]);
    const mock = await import('@/.storybook/cookie-consent-mock');
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter(name => !(name in mock))).toEqual([]);
  });

  it('saves by default and restores the previous outcome', async () => {
    await expect(saveConsent(consent)).resolves.toBeUndefined();
    await expect(readConsent()).resolves.toBeNull();

    const restore = setStorybookConsentSave('error');
    await expect(saveConsent(consent)).rejects.toThrow(
      'Consent cookie write failed'
    );
    restore();
    await expect(saveConsent(consent)).resolves.toBeUndefined();
  });

  it('fails like a lost connection when offline', async () => {
    const restore = setStorybookConsentSave('offline');
    await expect(saveConsent(consent)).rejects.toBeInstanceOf(TypeError);
    restore();
  });

  it('holds a pending save open', async () => {
    const restore = setStorybookConsentSave('pending');
    const settled = await Promise.race([
      saveConsent(consent).then(() => 'settled'),
      new Promise(resolve => setTimeout(() => resolve('pending'), 20)),
    ]);
    restore();
    expect(settled).toBe('pending');
  });

  it('blocks only the stored consent read and restores storage', () => {
    localStorage.setItem('jv_cc', '{}');
    localStorage.setItem('other', 'kept');
    const restore = blockStoredConsentRead();
    expect(() => localStorage.getItem('jv_cc')).toThrow(DOMException);
    expect(localStorage.getItem('other')).toBe('kept');
    restore();
    expect(localStorage.getItem('jv_cc')).toBe('{}');
  });

  it('is browser-safe and wired as a Storybook alias', () => {
    expect(read('.storybook/cookie-consent-mock.ts')).not.toMatch(
      /from ['"](node:|next\/headers)/
    );
    expect(read('.storybook/main.ts')).toMatch(
      /find: '@\/lib\/cookies\/consent',\s*replacement: require\.resolve\('\.\/cookie-consent-mock\.ts'\)/
    );
  });
});
