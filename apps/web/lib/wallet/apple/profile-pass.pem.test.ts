import { beforeEach, describe, expect, it, vi } from 'vitest';

const { env } = vi.hoisted(() => ({
  env: {
    APPLE_WALLET_APNS_PRODUCTION: 'false',
    APPLE_WALLET_AUTH_TOKEN_SECRET: 'test-auth-token-secret',
    APPLE_WALLET_PASS_TYPE_IDENTIFIER: 'pass.ie.jov.profile',
    APPLE_WALLET_SIGNER_CERT_PEM: String.raw`-----BEGIN CERT-----\nMIIB\n-----END CERT-----`,
    APPLE_WALLET_SIGNER_KEY_PEM: String.raw`-----BEGIN KEY-----\nKEY\n-----END KEY-----  `,
    APPLE_WALLET_TEAM_IDENTIFIER: 'TEAM123',
    APPLE_WALLET_WWDR_CERT_PEM:
      '-----BEGIN CERT-----\nWWDR\n-----END CERT-----',
  },
}));

vi.mock('server-only', () => ({}));
vi.mock('@parse/node-apn', () => ({
  Notification: class Notification {},
  Provider: class Provider {},
}));
vi.mock('passkit-generator', () => ({
  PKPass: class PKPass {},
}));
vi.mock('@/constants/domains', () => ({
  BASE_URL: 'https://jov.ie',
  getProfileUrl: (username: string) => `https://jov.ie/${username}`,
}));
vi.mock('@/lib/audience/source-links', () => ({
  createUniqueSourceLinkCode: vi.fn(),
}));
vi.mock('@/lib/auth/profile-completeness', () => ({
  isProfileComplete: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/env-server', () => ({ env }));

import { getAppleWalletConfig } from './profile-pass';

describe('getAppleWalletConfig PEM newlines', () => {
  beforeEach(() => {
    env.APPLE_WALLET_SIGNER_CERT_PEM = String.raw`-----BEGIN CERT-----\nMIIB\n-----END CERT-----`;
    env.APPLE_WALLET_WWDR_CERT_PEM =
      '-----BEGIN CERT-----\nWWDR\n-----END CERT-----';
  });

  it('restores literal backslash-n sequences and trims the key', () => {
    const config = getAppleWalletConfig();

    expect(config.signerCert).toBe(
      '-----BEGIN CERT-----\nMIIB\n-----END CERT-----'
    );
    expect(config.signerKey).toBe(
      '-----BEGIN KEY-----\nKEY\n-----END KEY-----'
    );
    expect(config.wwdr).toBe('-----BEGIN CERT-----\nWWDR\n-----END CERT-----');
  });
});
