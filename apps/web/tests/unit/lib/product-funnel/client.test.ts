import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PRODUCT_FUNNEL_SESSION_KEY = 'jovie_product_funnel_session_id';
const VALID_SESSION_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('product-funnel client session id persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('reuses a valid persisted session id', async () => {
    localStorage.setItem(PRODUCT_FUNNEL_SESSION_KEY, VALID_SESSION_ID);

    const { getProductFunnelSessionId } = await import(
      '@/lib/product-funnel/client'
    );

    expect(getProductFunnelSessionId()).toBe(VALID_SESSION_ID);
  });

  it('replaces an invalid persisted session id with a valid generated one', async () => {
    localStorage.setItem(PRODUCT_FUNNEL_SESSION_KEY, 'short');

    const { getProductFunnelSessionId } = await import(
      '@/lib/product-funnel/client'
    );

    const sessionId = getProductFunnelSessionId();

    expect(sessionId.length).toBeGreaterThanOrEqual(8);
    expect(sessionId.length).toBeLessThanOrEqual(128);
    expect(sessionId).not.toBe('short');
    expect(localStorage.getItem(PRODUCT_FUNNEL_SESSION_KEY)).toBe(sessionId);
  });

  it('returns a valid generated session id when storage access throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    const { getProductFunnelSessionId } = await import(
      '@/lib/product-funnel/client'
    );

    const sessionId = getProductFunnelSessionId();

    expect(sessionId.length).toBeGreaterThanOrEqual(8);
    expect(sessionId.length).toBeLessThanOrEqual(128);
  });
});
