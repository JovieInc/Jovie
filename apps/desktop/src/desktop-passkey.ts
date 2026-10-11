/**
 * Touch ID sign-in for the Mac app (JOV-6727).
 *
 * The app signs in with a device-bound WebAuthn passkey through the existing
 * Better Auth passkey plugin. Electron's Touch ID authenticator keeps the
 * private key in the Secure Enclave; the server stores only the public key,
 * and deleting the `ba_passkeys` row revokes it. Nothing long-lived is
 * written to disk here: the state file only remembers whether this Mac has
 * enrolled or declined, to decide which button to show.
 *
 * macOS only honors the `keychain-access-groups` entitlement that Electron
 * needs when an embedded Developer ID provisioning profile authorizes it, so
 * Touch ID turns on only for signed builds that ship that profile.
 */

export const DESKTOP_WEBAUTHN_TEAM_ID = 'G24T327LXT';
export const DESKTOP_PASSKEY_NAME = 'Jovie for Mac';

const BUNDLE_IDS: Readonly<Record<string, string>> = {
  production: 'app.jov.ie',
  staging: 'app.jov.ie.staging',
};

export interface DesktopWebAuthnConfig {
  readonly keychainAccessGroup: string;
  readonly promptReason: string;
}

export function resolveDesktopWebAuthnConfig(input: {
  readonly platform: string;
  readonly isPackaged: boolean;
  readonly appEnv: string;
  readonly hasEmbeddedProvisioningProfile: boolean;
}): DesktopWebAuthnConfig | null {
  if (input.platform !== 'darwin' || !input.isPackaged) return null;
  if (!input.hasEmbeddedProvisioningProfile) return null;
  const bundleId = BUNDLE_IDS[input.appEnv];
  if (!bundleId) return null;
  return {
    keychainAccessGroup: `${DESKTOP_WEBAUTHN_TEAM_ID}.${bundleId}.webauthn`,
    // macOS renders: "Jovie" is trying to sign in to jov.ie
    promptReason: 'sign in to $1',
  };
}

export interface DesktopPasskeyState {
  readonly enrolled: boolean;
  readonly dismissed: boolean;
}

export const EMPTY_DESKTOP_PASSKEY_STATE: DesktopPasskeyState = {
  enrolled: false,
  dismissed: false,
};

export function parseDesktopPasskeyState(raw: unknown): DesktopPasskeyState {
  if (typeof raw !== 'string') return EMPTY_DESKTOP_PASSKEY_STATE;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      enrolled: parsed.enrolled === true,
      dismissed: parsed.dismissed === true,
    };
  } catch {
    return EMPTY_DESKTOP_PASSKEY_STATE;
  }
}

export type DesktopPasskeyStateUpdate = 'enrolled' | 'dismissed' | 'reset';

export function applyDesktopPasskeyStateUpdate(
  update: unknown
): DesktopPasskeyState | null {
  switch (update) {
    case 'enrolled':
      return { enrolled: true, dismissed: false };
    case 'dismissed':
      return { enrolled: false, dismissed: true };
    case 'reset':
      return EMPTY_DESKTOP_PASSKEY_STATE;
    default:
      return null;
  }
}

export interface WebAuthnAccountChoice {
  readonly credentialId: string;
  readonly name?: string;
  readonly displayName?: string;
}

/**
 * One account signs in directly. Several need a choice; the caller shows a
 * native dialog with these labels (plus Cancel) and maps the index back.
 */
export function describeWebAuthnAccounts(
  accounts: readonly WebAuthnAccountChoice[]
):
  | { readonly kind: 'none' }
  | { readonly kind: 'single'; readonly credentialId: string }
  | { readonly kind: 'choose'; readonly labels: readonly string[] } {
  if (accounts.length === 0) return { kind: 'none' };
  if (accounts.length === 1) {
    return { kind: 'single', credentialId: accounts[0].credentialId };
  }
  return {
    kind: 'choose',
    labels: accounts.map(
      (account, index) =>
        account.name || account.displayName || `Account ${index + 1}`
    ),
  };
}
