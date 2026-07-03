import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');

describe('shipper-gated-entrypoint.py', () => {
  it('embeds fail-closed checkout and gbrain gates before execing the shipper', () => {
    const script = readFileSync(
      join(REPO_ROOT, 'scripts/hermes/shipper-gated-entrypoint.py'),
      'utf8'
    );

    expect(script).toContain('stale_checkout_abort');
    expect(script).toContain('assert_primary_checkout_fresh');
    expect(script).toContain('gbrain_alive');
    expect(script).toContain('shipping-paused');
    expect(script).toContain('codex-issue-shipper.ts');
    expect(script).toContain('send_telegram');
    expect(script).toContain('send_slack');
  });
});