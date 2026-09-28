import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomepageIdentityClose } from '@/components/homepage/HomepageIdentityClose';
import { HomepageIdentityHero } from '@/components/homepage/HomepageIdentityHero';
import { HomepageNoScriptContent } from '@/components/homepage/HomepageNoScriptContent';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';
import { evaluateHomepageHtml } from '../../../../../scripts/lib/golden-path-lock.mjs';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/analytics', () => ({
  page: vi.fn(),
  track: vi.fn(),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { priority, ...rest } = props;
    void priority;
    return <img alt='' {...rest} />;
  },
}));

/**
 * Production keeps WAITLIST_ENABLED on. That gate must not remove the homepage
 * conversion the prod probe reads from HTML: the jov.ie/you link claim that
 * submits to /start (Tim 2026-09-28, replacing the JOV-5085 name search).
 */
describe('homepage golden-path lock', () => {
  it('keeps the jov.ie/you claim and a /start handoff while the waitlist gate is on', () => {
    expect(FEATURE_FLAGS.WAITLIST_ENABLED).toBe(true);

    const { container } = render(
      <>
        <HomepageIdentityHero headingId='home-hero-heading' />
        <HomepageIdentityClose />
        <HomepageNoScriptContent />
      </>
    );

    const check = evaluateHomepageHtml(container.innerHTML);
    expect(check).toMatchObject({
      id: 'homepage-cta',
      ok: true,
      reason: expect.stringContaining('link claim'),
    });
    expect(container.innerHTML).not.toContain('Request access');
    expect(container.innerHTML).not.toContain('Get started');
    expect(container.innerHTML).not.toContain('/signup');
  });
});
