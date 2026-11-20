import assert from 'node:assert/strict';
import test from 'node:test';
import { extractSurfaceTokens } from '../coverage-surface-tokens.mjs';

test('single-file proxy surface yields stem token, not proxy.ts', () => {
  const tokens = extractSurfaceTokens({
    id: 'proxy',
    glob: 'apps/web/proxy.ts',
  });
  assert.ok(tokens.includes('proxy'));
  assert.ok(!tokens.includes('proxy.ts'));
});

test('directory surfaces keep distinctive trailing segments', () => {
  const tokens = extractSurfaceTokens({
    id: 'stripe-webhooks',
    glob: 'apps/web/app/api/stripe/webhooks/**',
  });
  assert.ok(tokens.includes('webhooks'));
  assert.ok(tokens.includes('stripe/webhooks'));
  assert.ok(tokens.includes('stripe-webhooks'));
});

test('hyphenated surface id is always retained', () => {
  const tokens = extractSurfaceTokens({
    id: 'app-shell-navigation',
    glob: 'apps/web/components/features/dashboard/dashboard-nav/**',
  });
  assert.ok(tokens.includes('app-shell-navigation'));
  assert.ok(tokens.includes('dashboard-nav'));
});
