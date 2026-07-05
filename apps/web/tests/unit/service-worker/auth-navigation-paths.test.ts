import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  AUTH_NAVIGATION_PATH_PREFIXES,
  isAuthNavigationPath,
} from '@/lib/service-worker/auth-navigation-paths';

const swSource = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');

describe('auth navigation path policy', () => {
  it('treats auth and OAuth callback routes as network-only', () => {
    expect(isAuthNavigationPath('/sso-callback')).toBe(true);
    expect(isAuthNavigationPath('/sso-callback/google')).toBe(true);
    expect(isAuthNavigationPath('/auth/native-complete')).toBe(true);
    expect(isAuthNavigationPath('/auth-return')).toBe(true);
    expect(isAuthNavigationPath('/desktop-auth')).toBe(true);
    expect(isAuthNavigationPath('/signin')).toBe(true);
    expect(isAuthNavigationPath('/__clerk/v1/client')).toBe(true);
  });

  it('does not treat normal app routes as auth-only', () => {
    expect(isAuthNavigationPath('/app/chat')).toBe(false);
    expect(isAuthNavigationPath('/offline.html')).toBe(false);
    expect(isAuthNavigationPath('/')).toBe(false);
  });

  it('keeps public/sw.js in sync with the TS source of truth', () => {
    for (const prefix of AUTH_NAVIGATION_PATH_PREFIXES) {
      expect(swSource).toContain(`'${prefix}'`);
    }
  });
});
