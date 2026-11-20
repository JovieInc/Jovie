import { describe, expect, it } from 'vitest';
import { CODE_FLAGS } from '@/lib/flags/code-flags';
import { APP_FLAG_KEYS } from '@/lib/flags/contracts';
import { PUBLIC_ACCESS_FLAG_CAPABILITIES } from './public-access-flags';
import { PRODUCT_FLAG_CAPABILITIES } from './registry';

describe('public access flag classifications', () => {
  it.each(
    Object.keys(PUBLIC_ACCESS_FLAG_CAPABILITIES) as Array<
      keyof typeof PUBLIC_ACCESS_FLAG_CAPABILITIES
    >
  )(
    'retains %s as an explicit access policy instead of a marketing capability',
    flag => {
      expect({ ...APP_FLAG_KEYS, ...CODE_FLAGS }).toHaveProperty(flag);
      expect(PRODUCT_FLAG_CAPABILITIES[flag]).toBe(
        PUBLIC_ACCESS_FLAG_CAPABILITIES[flag]
      );
      expect(PRODUCT_FLAG_CAPABILITIES[flag].nonMarketing).toBeTruthy();
      expect(PRODUCT_FLAG_CAPABILITIES[flag]).not.toHaveProperty(
        'capabilityId'
      );
    }
  );
  it('keeps the signup kill switch off by default without announcing a public capability', () => {
    expect(CODE_FLAGS.PUBLIC_SIGNUP_CLOSED).toBe(false);
    expect(PRODUCT_FLAG_CAPABILITIES.PUBLIC_SIGNUP_CLOSED).toEqual({
      nonMarketing: 'closed signup kill switch; default off',
    });
  });
});
