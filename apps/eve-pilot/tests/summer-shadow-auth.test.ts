import { describe, expect, it } from 'vitest';
import {
  JOVIE_PRODUCTION_OIDC_SUBJECT,
  ovieSummerShadowOidcAuth,
} from '../agent/channels/summer-shadow';

describe('Summer shadow OIDC boundary', () => {
  it('pins the only accepted external subject to Jovie production', () => {
    expect(JOVIE_PRODUCTION_OIDC_SUBJECT).toBe(
      'owner:jovie:project:jovie:environment:production'
    );
  });

  it('rejects an unsigned request', async () => {
    await expect(
      ovieSummerShadowOidcAuth(
        new Request('https://eve.example.com/ovie/v1/summer-shadow/events')
      )
    ).resolves.toBeNull();
  });
});
