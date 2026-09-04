import { describe, expect, it } from 'vitest';
import { buildVisualQaCoverageReceipt } from '../../../../scripts/visual-qa-coverage';

describe('visual QA coverage receipt', () => {
  it('retains route identity and registered quality gates for certification', async () => {
    const receipt = await buildVisualQaCoverageReceipt(null);
    const entry = receipt.entries.find(
      candidate => candidate.id === 'web-marketing-route-pay-desktop'
    );

    expect(entry?.source).toMatchObject({
      route: '/pay',
      expectedPath: '/pay',
      expectedRuntimeSelector: '[data-testid="pay-hero"]',
      fixturePath: '/pay',
      sourcePath: 'apps/web/app/(marketing)/pay/page.tsx',
      sourceSha: 'capture-time-git-sha',
      stateMatrix: ['anonymous-default'],
    });
    expect(entry?.qualityChecks).toEqual([
      'accessibility',
      'console-errors',
      'focus-visible',
      'horizontal-overflow',
      'layout-stability',
      'reduced-motion',
    ]);
  });
});
