import { afterEach, describe, expect, it, vi } from 'vitest';
import { selectedProductLanes } from '../ci-repo-lanes.mjs';

afterEach(() => vi.unstubAllEnvs());

describe('CI product-lane selection', () => {
  it.each([undefined, ''])(
    'keeps every canonical lane when configuration is %s',
    value => {
      vi.stubEnv('CI_PRODUCT_LANES', value);
      expect([...selectedProductLanes()]).toEqual([
        'ios',
        'mac',
        'web',
        'operations',
        'cross-product',
      ]);
    }
  );

  it('honors the selected lanes while removing duplicate and empty entries', () => {
    vi.stubEnv('CI_PRODUCT_LANES', 'web,operations,web,,mac');
    expect([...selectedProductLanes()]).toEqual(['web', 'operations', 'mac']);
  });

  it('reads the current configuration for each runner decision', () => {
    vi.stubEnv('CI_PRODUCT_LANES', 'web');
    expect([...selectedProductLanes()]).toEqual(['web']);
    vi.stubEnv('CI_PRODUCT_LANES', 'operations');
    expect([...selectedProductLanes()]).toEqual(['operations']);
  });

  it('does not broaden a nonempty selection to the default product lanes', () => {
    vi.stubEnv('CI_PRODUCT_LANES', 'web,unknown-product');
    expect([...selectedProductLanes()]).toEqual(['web', 'unknown-product']);
  });
});
