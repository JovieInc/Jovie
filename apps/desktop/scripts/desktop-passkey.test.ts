import { expect, test } from 'vitest';
import {
  applyDesktopPasskeyStateUpdate,
  describeWebAuthnAccounts,
  EMPTY_DESKTOP_PASSKEY_STATE,
  parseDesktopPasskeyState,
  resolveDesktopWebAuthnConfig,
} from '../src/desktop-passkey.ts';

const SIGNED_PROD = {
  platform: 'darwin',
  isPackaged: true,
  appEnv: 'production',
  hasEmbeddedProvisioningProfile: true,
};

test('enables Touch ID only for signed Mac builds that embed the profile', () => {
  expect(resolveDesktopWebAuthnConfig(SIGNED_PROD)).toEqual({
    keychainAccessGroup: 'G24T327LXT.app.jov.ie.webauthn',
    promptReason: 'sign in to $1',
  });
  expect(
    resolveDesktopWebAuthnConfig({ ...SIGNED_PROD, appEnv: 'staging' })
      ?.keychainAccessGroup
  ).toBe('G24T327LXT.app.jov.ie.staging.webauthn');

  for (const override of [
    { hasEmbeddedProvisioningProfile: false },
    { isPackaged: false },
    { platform: 'win32' },
    { appEnv: 'local' },
  ]) {
    expect(
      resolveDesktopWebAuthnConfig({ ...SIGNED_PROD, ...override })
    ).toBeNull();
  }
});

test('parses the enrollment state file defensively', () => {
  expect(parseDesktopPasskeyState('{"enrolled":true}')).toEqual({
    enrolled: true,
    dismissed: false,
  });
  expect(parseDesktopPasskeyState('not json')).toEqual(
    EMPTY_DESKTOP_PASSKEY_STATE
  );
  expect(parseDesktopPasskeyState('{"enrolled":"yes"}')).toEqual(
    EMPTY_DESKTOP_PASSKEY_STATE
  );
  expect(parseDesktopPasskeyState(undefined)).toEqual(
    EMPTY_DESKTOP_PASSKEY_STATE
  );
});

test('accepts only known enrollment state updates', () => {
  expect(applyDesktopPasskeyStateUpdate('enrolled')).toEqual({
    enrolled: true,
    dismissed: false,
  });
  expect(applyDesktopPasskeyStateUpdate('dismissed')).toEqual({
    enrolled: false,
    dismissed: true,
  });
  expect(applyDesktopPasskeyStateUpdate('reset')).toEqual(
    EMPTY_DESKTOP_PASSKEY_STATE
  );
  expect(applyDesktopPasskeyStateUpdate('admin')).toBeNull();
  expect(applyDesktopPasskeyStateUpdate({ enrolled: true })).toBeNull();
});

test('signs in directly with one account and asks when there are several', () => {
  expect(describeWebAuthnAccounts([])).toEqual({ kind: 'none' });
  expect(describeWebAuthnAccounts([{ credentialId: 'c1' }])).toEqual({
    kind: 'single',
    credentialId: 'c1',
  });
  expect(
    describeWebAuthnAccounts([
      { credentialId: 'c1', name: 'tim@jov.ie' },
      { credentialId: 'c2', displayName: 'Tim' },
      { credentialId: 'c3' },
    ])
  ).toEqual({ kind: 'choose', labels: ['tim@jov.ie', 'Tim', 'Account 3'] });
});
