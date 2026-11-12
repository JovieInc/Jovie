// Homepage start CTA (HOMEPAGE_START_CTA, default off). Public signup
// reopened on 2026-11-09 (canon/PRODUCT.md), so with the flag on the hero's
// primary action enters the one onboarding flow at /start, which is what the
// production certification check `stranger-homepage-signup-entry`
// (scripts/lib/prod-cert-truth.mjs) looks for in the homepage HTML. Off, the
// page is the invite-only story pinned by homepage-contract.test.tsx.
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

describe('homepage start CTA flag', { timeout: 60_000 }, () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('is off by default: the hero scrolls to the invitation form and nothing links to signup', async () => {
    const { CODE_FLAGS } = await import('@/lib/flags/code-flags');
    expect(CODE_FLAGS.HOMEPAGE_START_CTA).toBe(false);
    const { copy, anchor } = await load();
    const { container } = await renderHomePage();

    const primary = screen.getByTestId('homepage-primary-cta');
    expect(primary).toHaveAttribute('href', `#${anchor}`);
    expect(primary).toHaveTextContent(copy.hero.primaryAction);
    expect(screen.getByText(copy.hero.note)).toBeInTheDocument();
    expect(signupEntries(container.innerHTML)).toEqual([]);
    // The close is the invitation form, and the header keeps its invite action.
    const close = container.querySelector(`#${anchor}`);
    expect(close).toHaveTextContent(copy.invite.headline);
    expect(
      close?.querySelector('[data-testid="waitlist-role-form"]')
    ).not.toBeNull();
    expect(screen.queryByTestId('homepage-close-cta')).toBeNull();
    const { resolveHomepageHeaderCta, resolveHomepageClaimClose } =
      await import('@/data/homepageStartCta');
    expect(resolveHomepageHeaderCta()).toEqual({
      label: 'Request an Invite',
      href: `/#${anchor}`,
    });
    expect(resolveHomepageClaimClose()).toBeNull();
  });

  it('on: the hero primary action is the shared claim-profile intent into /start', async () => {
    vi.stubEnv('FEATURE_HOMEPAGE_START_CTA', 'true');
    const { copy, anchor, claim } = await load();
    const { container } = await renderHomePage();

    const primary = screen.getByTestId('homepage-primary-cta');
    expect(claim.href).toBe('/start');
    expect(primary).toHaveAttribute('href', claim.href);
    expect(primary).toHaveTextContent(claim.label);
    expect(
      container.querySelectorAll('[data-primary-action="true"]')
    ).toHaveLength(1);
    // What the stranger certification check reads from the homepage HTML.
    expect(signupEntries(container.innerHTML)).toEqual(['/start']);

    // The note under the actions describes the invitation form, so it goes.
    expect(screen.queryByText(copy.hero.note)).not.toBeInTheDocument();
    // The locked headline, the secondary action and the form are untouched.
    expect(
      screen.getByRole('heading', { level: 1, name: copy.hero.headline })
    ).toBeInTheDocument();
    expect(screen.getByTestId('homepage-hero-live-profile')).toHaveAttribute(
      'href',
      copy.hero.secondaryHref
    );

    // The close is the same intent, in the approved artist-profile closing
    // copy: no form, and nothing on the page still says invitation.
    const { ARTIST_PROFILE_COPY } = await import('@/data/artistProfileCopy');
    const close = screen.getByTestId('marketing-section-cta');
    expect(close).toHaveTextContent(ARTIST_PROFILE_COPY.finalCta.headline);
    expect(close).toHaveTextContent(ARTIST_PROFILE_COPY.finalCta.subhead);
    expect(
      close.querySelector('[data-testid="waitlist-role-form"]')
    ).toBeNull();
    const closeCta = screen.getByTestId('homepage-close-cta');
    expect(close).toContainElement(closeCta);
    expect(closeCta).toHaveAttribute('href', claim.href);
    expect(closeCta).toHaveTextContent(claim.label);
    expect(container.textContent).not.toMatch(/invit/i);
    expect(container.innerHTML).not.toContain(anchor);
  });

  it('on: the header action resolves to the same claim intent', async () => {
    vi.stubEnv('FEATURE_HOMEPAGE_START_CTA', 'true');
    const { claim } = await load();
    const { resolveHomepageHeaderCta, resolveHomepageClaimClose } =
      await import('@/data/homepageStartCta');
    expect(resolveHomepageHeaderCta()).toEqual({
      label: claim.label,
      href: claim.href,
    });
    expect(resolveHomepageClaimClose()).toMatchObject({
      label: claim.label,
      href: claim.href,
    });
  });

  it('on, but public signup closed: the hero keeps the invitation action', async () => {
    vi.stubEnv('FEATURE_HOMEPAGE_START_CTA', 'true');
    vi.stubEnv('FEATURE_PUBLIC_SIGNUP_CLOSED', 'true');
    const { copy, anchor } = await load();
    const { container } = await renderHomePage();

    const primary = screen.getByTestId('homepage-primary-cta');
    expect(primary).toHaveAttribute('href', `#${anchor}`);
    expect(primary).toHaveTextContent(copy.hero.primaryAction);
    expect(signupEntries(container.innerHTML)).toEqual([]);
    expect(container.querySelector(`#${anchor}`)).toHaveTextContent(
      copy.invite.headline
    );
    expect(screen.queryByTestId('homepage-close-cta')).toBeNull();
    const { resolveHomepageHeaderCta } = await import(
      '@/data/homepageStartCta'
    );
    expect(resolveHomepageHeaderCta().href).toBe(`/#${anchor}`);
  });
});
