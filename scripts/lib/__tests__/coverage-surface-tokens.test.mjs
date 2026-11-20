import { describe, expect, it } from 'vitest';
import { extractSurfaceTokens } from '../coverage-surface-tokens.mjs';

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
