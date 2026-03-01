import { describe, expect, it } from 'vitest';
import { renderClaimCreativeSvg } from '@/lib/retargeting/claim-creatives';

describe('renderClaimCreativeSvg', () => {
  it('renders expected copy and dimensions', () => {
    const svg = renderClaimCreativeSvg({
      username: 'ladygaga',
      claimLink: '/ladygaga/claim?token=abc123',
      width: 1080,
      height: 1920,
    });

    expect(svg).toContain('width="1080"');
    expect(svg).toContain('height="1920"');
    expect(svg).toContain('jov.ie/ladygaga');
    expect(svg).toContain('Claim your profile');
  });

  it('creates deterministic output for the same input', () => {
    const params = {
      username: 'postmalone',
      claimLink: '/postmalone/claim?token=token123',
      width: 1080,
      height: 1080,
    } as const;

    const first = renderClaimCreativeSvg(params);
    const second = renderClaimCreativeSvg(params);

    expect(first).toBe(second);
  });
});
