import { describe, expect, it } from 'vitest';
import {
  extractSurfaceTokens,
  surfaceAppPrefix,
  testPathMatchesSurface,
} from '../coverage-surface-tokens.mjs';

describe('extractSurfaceTokens', () => {
  it('single-file proxy surface yields stem token, not proxy.ts', () => {
    const tokens = extractSurfaceTokens({
      id: 'proxy',
      glob: 'apps/web/proxy.ts',
    });
    expect(tokens).toContain('proxy');
    expect(tokens).not.toContain('proxy.ts');
  });

  it('directory surfaces keep distinctive trailing segments', () => {
    const tokens = extractSurfaceTokens({
      id: 'stripe-webhooks',
      glob: 'apps/web/app/api/stripe/webhooks/**',
    });
    expect(tokens).toContain('webhooks');
    expect(tokens).toContain('stripe/webhooks');
    expect(tokens).toContain('stripe-webhooks');
  });

  it('hyphenated surface id is always retained', () => {
    const tokens = extractSurfaceTokens({
      id: 'app-shell-navigation',
      glob: 'apps/web/components/features/dashboard/dashboard-nav/**',
    });
    expect(tokens).toContain('app-shell-navigation');
    expect(tokens).toContain('dashboard-nav');
  });
});

describe('testPathMatchesSurface', () => {
  const proxy = { id: 'proxy', glob: 'apps/web/proxy.ts' };

  it('scopes proxy matches to apps/web and rejects other packages', () => {
    expect(surfaceAppPrefix(proxy)).toBe('apps/web/');
    expect(
      testPathMatchesSurface(
        'apps/web/tests/e2e/proxy-audience-gate.spec.ts',
        proxy
      )
    ).toBe(true);
    expect(
      testPathMatchesSurface(
        'apps/web/lib/auth/proxy-request-handler.test.ts',
        proxy
      )
    ).toBe(true);
    expect(testPathMatchesSurface('apps/ovie/proxy.test.ts', proxy)).toBe(
      false
    );
    expect(
      testPathMatchesSurface('packages/jovie-cli/src/proxy.test.ts', proxy)
    ).toBe(false);
  });

  it('does not match mid-segment substrings', () => {
    expect(
      testPathMatchesSurface(
        'apps/web/tests/unit/lib/approxy-helper.test.ts',
        proxy
      )
    ).toBe(false);
  });

  it('matches kebab/snake tokens after - or _ without bare-substring hits', () => {
    expect(
      testPathMatchesSurface(
        'apps/web/tests/integration/middleware-proxy.test.ts',
        proxy
      )
    ).toBe(true);
    expect(
      testPathMatchesSurface(
        'apps/web/tests/unit/lib/auth_proxy_gate.test.ts',
        proxy
      )
    ).toBe(true);

    const onboarding = {
      id: 'claim-onboarding',
      glob: 'apps/web/app/onboarding/**',
    };
    expect(
      testPathMatchesSurface(
        'apps/web/tests/e2e/canary-auth-signup-onboarding.spec.ts',
        onboarding
      )
    ).toBe(true);
    expect(
      testPathMatchesSurface(
        'apps/web/tests/unit/lib/contact-limit-entitlements.test.ts',
        onboarding
      )
    ).toBe(false);

    // Prefix still blocks other apps even when kebab would otherwise match.
    expect(
      testPathMatchesSurface('apps/ovie/middleware-proxy.test.ts', proxy)
    ).toBe(false);
  });

  it('still matches stripe webhook tests under apps/web', () => {
    const surface = {
      id: 'stripe-webhooks',
      glob: 'apps/web/app/api/stripe/webhooks/**',
    };
    expect(
      testPathMatchesSurface(
        'apps/web/tests/unit/api/stripe/webhooks/route.test.ts',
        surface
      )
    ).toBe(true);
  });
});
