import { describe, expect, it } from 'vitest';
import {
  buildShopRedirectUrl,
  getShopifyUrl,
  isShopEnabled,
  isShopifyDomain,
} from '@/lib/profile/shop-settings';

describe('isShopifyDomain', () => {
  it('accepts valid *.myshopify.com URLs', () => {
    expect(isShopifyDomain('https://my-store.myshopify.com')).toBe(true);
    expect(isShopifyDomain('https://my-store.myshopify.com/')).toBe(true);
    expect(isShopifyDomain('https://my-store.myshopify.com/products')).toBe(
      true
    );
  });

  it('rejects non-myshopify domains', () => {
    expect(isShopifyDomain('https://evil.com')).toBe(false);
    expect(isShopifyDomain('https://myshopify.com.evil.com')).toBe(false);
    expect(isShopifyDomain('https://shop.example.com')).toBe(false);
  });

  it('rejects non-HTTPS URLs', () => {
    expect(isShopifyDomain('http://my-store.myshopify.com')).toBe(false);
  });

  it('rejects invalid URLs', () => {
    expect(isShopifyDomain('')).toBe(false);
    expect(isShopifyDomain('not-a-url')).toBe(false);
    expect(isShopifyDomain('javascript:alert(1)')).toBe(false);
  });

  it('rejects URLs exceeding max length', () => {
    const longPath = 'a'.repeat(2100);
    expect(isShopifyDomain(`https://store.myshopify.com/${longPath}`)).toBe(
      false
    );
  });
});

describe('getShopifyUrl', () => {
  it('returns the URL when valid', () => {
    expect(
      getShopifyUrl({ shopifyUrl: 'https://cool-store.myshopify.com' })
    ).toBe('https://cool-store.myshopify.com');
  });

  it('returns null for missing or empty settings', () => {
    expect(getShopifyUrl(null)).toBeNull();
    expect(getShopifyUrl(undefined)).toBeNull();
    expect(getShopifyUrl({})).toBeNull();
    expect(getShopifyUrl({ shopifyUrl: '' })).toBeNull();
  });

  it('returns null for non-string values', () => {
    expect(getShopifyUrl({ shopifyUrl: 123 })).toBeNull();
    expect(getShopifyUrl({ shopifyUrl: true })).toBeNull();
  });

  it('returns null for invalid Shopify URLs', () => {
    expect(getShopifyUrl({ shopifyUrl: 'https://evil.com' })).toBeNull();
  });
});

describe('isShopEnabled', () => {
  it('returns true when shopifyUrl is valid', () => {
    expect(isShopEnabled({ shopifyUrl: 'https://store.myshopify.com' })).toBe(
      true
    );
  });

  it('returns false when shopifyUrl is missing or invalid', () => {
    expect(isShopEnabled(null)).toBe(false);
    expect(isShopEnabled({})).toBe(false);
    expect(isShopEnabled({ shopifyUrl: 'https://evil.com' })).toBe(false);
  });
});

describe('buildShopRedirectUrl', () => {
  it('appends UTM params', () => {
    const result = buildShopRedirectUrl('https://store.myshopify.com', 'tim');
    const url = new URL(result);
    expect(url.searchParams.get('utm_source')).toBe('jovie');
    expect(url.searchParams.get('utm_medium')).toBe('profile');
    expect(url.searchParams.get('utm_campaign')).toBe('shop_click');
    expect(url.searchParams.get('utm_content')).toBe('tim');
  });

  it('preserves existing path', () => {
    const result = buildShopRedirectUrl(
      'https://store.myshopify.com/collections/all',
      'tim'
    );
    expect(new URL(result).pathname).toBe('/collections/all');
  });
});
