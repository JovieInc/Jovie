import { describe, expect, it } from 'vitest';

describe('signup metadata', () => {
  it('exports share metadata for the sign-up page', async () => {
    const { metadata } = await import('../../../app/(auth)/signup/layout');

    expect(metadata.title).toBe('Sign up | Jovie');
    expect(metadata.description).toContain('Create your Jovie account');
    expect(metadata.alternates?.canonical).toBe('/signup');
    expect(metadata.openGraph?.url).toBe('https://jov.ie/signup');
    expect(
      metadata.twitter && 'card' in metadata.twitter && metadata.twitter.card
    ).toBe('summary_large_image');
  });
});
