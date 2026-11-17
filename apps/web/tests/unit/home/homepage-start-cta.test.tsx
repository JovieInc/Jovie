// Homepage claim actions. Public signup reopened on 2026-11-09
// (canon/PRODUCT.md) and Tim switched the homepage on 2026-11-12 23:46Z
// ("Switch it"): the hero, header and close enter the one onboarding flow at
// /start, which is what the production certification check
// `stranger-homepage-signup-entry` (scripts/lib/prod-cert-truth.mjs) looks for
// in the homepage HTML. Only the PUBLIC_SIGNUP_CLOSED kill switch brings back
// the invite-only story.
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { signupEntries } from '../../../../../scripts/lib/prod-cert-truth.mjs';

vi.mock('@/lib/analytics', () => ({ track: vi.fn(), page: vi.fn() }));
vi.mock('@/lib/content-records/store.server', async () => {
  const { MARKETING_PAGE_KIND } = await import(
    '@/lib/content-records/marketing-page'
  );
  return {
    getLiveContent: async () => ({
      data: MARKETING_PAGE_KIND.defaultRecord('home'),
      source: 'default',
      versionId: null,
      version: null,
      publishedAt: null,
    }),
  };
});
vi.mock('next/navigation', async importOriginal => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, quality, ...rest } = props;
    void fill;
    void priority;
    void quality;
    return <img alt='' {...rest} />;
  },
}));

async function renderHomePage() {
  const { default: HomePage } = await import('@/app/(home)/page');
  return render(await HomePage());
}

async function load() {
  const [{ HOMEPAGE_EDITORIAL_COPY, HOMEPAGE_INVITE_ANCHOR }, intents] =
    await Promise.all([
      import('@/data/homepageEditorialCopy'),
      import('@/data/marketingCtaIntents'),
    ]);
  return {
    copy: HOMEPAGE_EDITORIAL_COPY,
    anchor: HOMEPAGE_INVITE_ANCHOR,
    claim: intents.getClaimProfileIntent(),
  };
}

describe('homepage claim actions', { timeout: 60_000 }, () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('has no copy-approval flag left: the homepage start CTA is the default', async () => {
    const { CODE_FLAGS } = await import('@/lib/flags/code-flags');
    expect('HOMEPAGE_START_CTA' in CODE_FLAGS).toBe(false);
  });

  it('sends the hero, header and close into /start with the claim-profile intent', async () => {
    const { copy, anchor, claim } = await load();
    const { HOME_MARKETING_HEADER_CTA } = await import(
      '@/data/marketing/headerCta'
    );
    const { container } = await renderHomePage();

    const primary = screen.getByTestId('homepage-primary-cta');
    expect(claim.href).toBe('/start');
    expect(primary).toHaveAttribute('href', claim.href);
    expect(primary).toHaveTextContent(claim.label);
    expect(HOME_MARKETING_HEADER_CTA).toEqual({
      label: claim.label,
      href: claim.href,
    });
    expect(
      container.querySelectorAll('[data-primary-action="true"]')
    ).toHaveLength(1);
    // What the stranger certification check reads from the homepage HTML.
    expect(signupEntries(container.innerHTML)).toEqual(['/start']);

    // The note under the actions describes the invitation form, so it goes.
    expect(screen.queryByText(copy.hero.note)).not.toBeInTheDocument();
    // The locked headline and the secondary action are untouched.
    expect(
      screen.getByRole('heading', { level: 1, name: copy.hero.headline })
    ).toBeInTheDocument();
    expect(screen.getByTestId('homepage-hero-live-profile')).toHaveAttribute(
      'href',
      copy.hero.secondaryHref
    );

    // The close is the claim, not the invitation form.
    const close = container.querySelector(`#${anchor}`);
    expect(
      close?.querySelector('[data-testid="waitlist-role-form"]')
    ).toBeNull();
    expect(close).toHaveTextContent(copy.claim.headline.replace('.', ''));
    expect(
      close?.querySelector('[data-testid="homepage-close-cta"]')
    ).toHaveAttribute('href', claim.href);
    expect(container.innerHTML).not.toContain(copy.invite.headline);
  });

  it('public signup closed: the hero and close keep the invitation form', async () => {
    vi.stubEnv('FEATURE_PUBLIC_SIGNUP_CLOSED', 'true');
    const { copy, anchor } = await load();
    const { container } = await renderHomePage();

    const primary = screen.getByTestId('homepage-primary-cta');
    expect(primary).toHaveAttribute('href', `#${anchor}`);
    expect(primary).toHaveTextContent(copy.hero.primaryAction);
    expect(signupEntries(container.innerHTML)).toEqual([]);
    const close = container.querySelector(`#${anchor}`);
    expect(
      close?.querySelector('[data-testid="waitlist-role-form"]')
    ).not.toBeNull();
  });
});
