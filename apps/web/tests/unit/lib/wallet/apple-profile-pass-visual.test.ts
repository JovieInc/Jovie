import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  captureErrorMock: vi.fn(),
  downloadImageMock: vi.fn(),
  getAsBufferMock: vi.fn(),
  getSharpMock: vi.fn(),
  pkPassConstructorMock: vi.fn(),
  sanitizeHttpsUrlMock: vi.fn(),
  setBarcodesMock: vi.fn(),
  warnMock: vi.fn(),
}));

vi.mock('@parse/node-apn', () => ({
  Notification: class Notification {},
  Provider: class Provider {},
}));

vi.mock('passkit-generator', () => ({
  PKPass: class PKPass {
    constructor(...args: unknown[]) {
      hoisted.pkPassConstructorMock(...args);
    }

    setBarcodes(...args: unknown[]) {
      hoisted.setBarcodesMock(...args);
    }

    getAsBuffer() {
      return hoisted.getAsBufferMock();
    }
  },
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

vi.mock('@/lib/env-server', () => ({
  env: {
    APPLE_WALLET_APNS_PRODUCTION: 'false',
    APPLE_WALLET_AUTH_TOKEN_SECRET: 'test-auth-token-secret',
    APPLE_WALLET_PASS_TYPE_IDENTIFIER: 'pass.ie.jov.profile',
    APPLE_WALLET_SIGNER_CERT_PEM: 'signer-cert',
    APPLE_WALLET_SIGNER_KEY_PASSPHRASE: 'signer-key-passphrase',
    APPLE_WALLET_SIGNER_KEY_PEM: 'signer-key',
    APPLE_WALLET_TEAM_IDENTIFIER: 'TEAM123',
    APPLE_WALLET_WWDR_CERT_PEM: 'wwdr-cert',
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

vi.mock('@/lib/ingestion/avatar/http-client', () => ({
  downloadImage: hoisted.downloadImageMock,
  sanitizeHttpsUrl: hoisted.sanitizeHttpsUrlMock,
}));

vi.mock('@/lib/ingestion/avatar/image-optimizer', () => ({
  getSharp: hoisted.getSharpMock,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: hoisted.warnMock },
}));

import { contrastRatio } from '@/lib/utils/color';
import {
  buildAppleWalletPassAssets,
  buildAppleWalletPassBarcode,
  buildAppleWalletPassDefinition,
  generateAppleWalletProfilePassBuffer,
} from '@/lib/wallet/apple/profile-pass';

const pass = {
  avatarUrl: null,
  creatorProfileId: 'profile_123',
  displayName:
    'A Very Long Public Artist Display Name That Wallet Must Render Natively',
  handle: 'a-very-long-public-handle',
  id: 'pass_123',
  passTypeIdentifier: 'pass.ie.jov.profile',
  passVersion: 7,
  profileUrl: 'https://jov.ie/a-very-long-public-handle',
  serialNumber: 'serial_123',
  sourceLinkId: 'source_123',
  walletShareUrl: 'https://jov.ie/s/wallet-code',
};

describe('Apple Wallet profile pass visual contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.captureErrorMock.mockResolvedValue(undefined);
    hoisted.getAsBufferMock.mockReturnValue(Buffer.from('signed-pass'));
    hoisted.sanitizeHttpsUrlMock.mockImplementation((url: string | null) =>
      url?.startsWith('https://') ? url : null
    );
    hoisted.getSharpMock.mockResolvedValue((input: Buffer) => {
      let resizeOptions: unknown;
      const pipeline = {
        rotate: () => pipeline,
        resize: (options: unknown) => {
          resizeOptions = options;
          return pipeline;
        },
        png: () => pipeline,
        toBuffer: () =>
          Promise.resolve(
            Buffer.from(`${input.toString()}:${JSON.stringify(resizeOptions)}`)
          ),
      };
      return pipeline;
    });
  });

  it('uses one canonical wordmark with graphite, cream identity text, and native identity fields', () => {
    const definition = buildAppleWalletPassDefinition(pass, {
      authenticationToken: 'auth_token',
      teamIdentifier: 'TEAM123',
      webServiceURL: 'https://jov.ie/api/wallet/apple/v1',
    });

    expect(definition).toMatchObject({
      authenticationToken: 'auth_token',
      backgroundColor: 'rgb(6,8,13)',
      description: 'Jovie Profile',
      formatVersion: 1,
      foregroundColor: 'rgb(245,244,240)',
      labelColor: 'rgb(141,141,147)',
      organizationName: 'Jovie',
      passTypeIdentifier: pass.passTypeIdentifier,
      serialNumber: pass.serialNumber,
      teamIdentifier: 'TEAM123',
      userInfo: {
        creatorProfileId: pass.creatorProfileId,
        kind: 'jovie_profile',
        passVersion: pass.passVersion,
        sourceLinkId: pass.sourceLinkId,
      },
      webServiceURL: 'https://jov.ie/api/wallet/apple/v1',
      generic: {
        backFields: expect.arrayContaining([
          expect.objectContaining({
            key: 'profile',
            label: 'Profile URL',
            value: pass.profileUrl,
          }),
        ]),
        headerFields: [],
        primaryFields: [
          {
            key: 'name',
            label: 'PROFILE',
            value: pass.displayName,
          },
        ],
        secondaryFields: [
          {
            key: 'handle',
            label: 'HANDLE',
            value: `@${pass.handle}`,
          },
        ],
      },
    });
    expect(definition).not.toHaveProperty('logoText');
    expect(JSON.stringify(definition.generic)).not.toContain('JOVIE');
    expect(contrastRatio('#F5F4F0', '#06080D')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#8D8D93', '#06080D')).toBeGreaterThanOrEqual(4.5);
  });

  it('preserves the tracked QR destination and readable public profile URL', () => {
    expect(buildAppleWalletPassBarcode(pass)).toEqual({
      altText: `jov.ie/${pass.handle}`,
      format: 'PKBarcodeFormatQR',
      message: pass.walletShareUrl,
      messageEncoding: 'iso-8859-1',
    });
  });

  it('assembles the visual assets and unchanged barcode into the existing PassKit generator', async () => {
    const result = await generateAppleWalletProfilePassBuffer(
      pass as Parameters<typeof generateAppleWalletProfilePassBuffer>[0],
      'auth_token'
    );

    expect(result).toEqual(Buffer.from('signed-pass'));
    expect(hoisted.pkPassConstructorMock).toHaveBeenCalledOnce();
    const [assets, certificates] = hoisted.pkPassConstructorMock.mock.calls[0];
    const definition = JSON.parse(
      (assets as Record<string, Buffer>)['pass.json'].toString()
    );
    expect(definition).toMatchObject({
      backgroundColor: 'rgb(6,8,13)',
      passTypeIdentifier: pass.passTypeIdentifier,
      serialNumber: pass.serialNumber,
    });
    expect(definition).not.toHaveProperty('logoText');
    expect(assets).toEqual(
      expect.objectContaining({
        'icon.png': expect.any(Buffer),
        'logo.png': expect.any(Buffer),
        'thumbnail.png': expect.any(Buffer),
      })
    );
    expect(certificates).toEqual({
      signerCert: 'signer-cert',
      signerKey: 'signer-key',
      signerKeyPassphrase: 'signer-key-passphrase',
      wwdr: 'wwdr-cert',
    });
    expect(hoisted.setBarcodesMock).toHaveBeenCalledWith(
      buildAppleWalletPassBarcode(pass)
    );
  });

  it('uses the canonical wordmark asset and a clean mark fallback when the portrait is missing', async () => {
    const assets = await buildAppleWalletPassAssets(pass);

    expect(assets['logo.png'].toString()).toContain('viewBox="0 0 374 100"');
    expect(assets['logo@2x.png'].toString()).toContain('viewBox="0 0 374 100"');
    expect(assets['thumbnail.png'].toString()).toContain(
      'viewBox="0 0 360 360"'
    );
    expect(assets['thumbnail@2x.png'].toString()).toContain(
      'viewBox="0 0 360 360"'
    );
    expect(hoisted.downloadImageMock).not.toHaveBeenCalled();
  });

  it('keeps an available portrait in the supported thumbnail slot', async () => {
    const portraitPass = {
      ...pass,
      avatarUrl: 'https://cdn.jov.ie/profile.jpg',
    };
    hoisted.downloadImageMock.mockResolvedValue({
      buffer: Buffer.from('portrait'),
    });

    const assets = await buildAppleWalletPassAssets(portraitPass);

    expect(assets['thumbnail.png'].toString()).toContain('portrait');
    expect(assets['thumbnail.png'].toString()).toContain('"fit":"cover"');
    expect(assets['thumbnail@2x.png'].toString()).toContain('portrait');
  });

  it.each([new Error('unreadable image'), 'unreadable image'])(
    'falls back cleanly when a remote portrait cannot be rendered (%#)',
    async portraitFailure => {
      const portraitPass = {
        ...pass,
        avatarUrl: 'https://cdn.jov.ie/broken-profile.jpg',
      };
      hoisted.downloadImageMock.mockRejectedValue(portraitFailure);
      hoisted.captureErrorMock.mockRejectedValue(new Error('capture failed'));

      const assets = await buildAppleWalletPassAssets(portraitPass);

      expect(assets['thumbnail.png'].toString()).toContain(
        'viewBox="0 0 360 360"'
      );
      expect(assets['thumbnail@2x.png'].toString()).toContain(
        'viewBox="0 0 360 360"'
      );
      expect(hoisted.warnMock).toHaveBeenCalledOnce();
      expect(hoisted.captureErrorMock).toHaveBeenCalledOnce();
    }
  );
});
