import { verifyVercelOidc } from 'eve/channels/auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  JOVIE_PRODUCTION_OIDC_SUBJECT,
  ovieSummerShadowOidcAuth,
} from '../agent/channels/summer-shadow';

vi.mock('eve/channels/auth', async importOriginal => ({
  ...(await importOriginal<typeof import('eve/channels/auth')>()),
  verifyVercelOidc: vi.fn(),
}));
const verify = vi.mocked(verifyVercelOidc);
const request = () =>
  new Request('https://eve.example.com/ovie/v1/summer-shadow/events', {
    headers: { authorization: 'Bearer opaque-token' },
  });
const accepted = (subject: string) => ({
  ok: true as const,
  sessionAuth: {
    subject,
    attributes: {},
    principalId: 'vercel-app',
    issuer: 'https://oidc.vercel.com/jovie',
    authenticator: 'vercel-oidc',
  },
});

describe('Summer shadow OIDC boundary', () => {
  beforeEach(() => vi.resetAllMocks());
  it('pins and verifies the exact Jovie production application', async () => {
    expect(JOVIE_PRODUCTION_OIDC_SUBJECT).toBe(
      'owner:jovie:project:jovie:environment:production'
    );
    verify.mockResolvedValue(accepted(JOVIE_PRODUCTION_OIDC_SUBJECT));
    expect(await ovieSummerShadowOidcAuth(request())).toMatchObject({
      subject: JOVIE_PRODUCTION_OIDC_SUBJECT,
      attributes: {
        dispatchAuthority: 'none',
        identity: 'summer',
        readOnly: 'true',
      },
    });
    expect(verify).toHaveBeenCalledWith('opaque-token', {
      subjects: [JOVIE_PRODUCTION_OIDC_SUBJECT],
    });
  });
  it.each([
    'owner:other:project:jovie:environment:production',
    'owner:jovie:project:other:environment:production',
    'owner:jovie:project:jovie:environment:preview',
    'owner:jovie:project:jovie-eve-shadow:environment:production',
  ])('rejects verifier-approved caller outside the exact boundary: %s', async subject => {
    verify.mockResolvedValue(accepted(subject));
    await expect(ovieSummerShadowOidcAuth(request())).resolves.toBeNull();
  });
  it('rejects unsigned or failed verification', async () => {
    verify.mockResolvedValue({
      ok: false,
      status: 401,
      error: 'invalid_token',
    } as Awaited<ReturnType<typeof verifyVercelOidc>>);
    await expect(
      ovieSummerShadowOidcAuth(new Request('https://eve.example.com/'))
    ).resolves.toBeNull();
  });
});
