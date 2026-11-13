// One front door: the homepage always enters /start. Legacy CTA and signup
// flags control downstream availability, not the public claim entry.
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

  it('claims a handle through /start with the legacy flag off by default', async () => {
    const { CODE_FLAGS } = await import('@/lib/flags/code-flags');
    expect(CODE_FLAGS.HOMEPAGE_START_CTA).toBe(false);
    const { copy } = await load();
    const { container } = await renderHomePage();

    const primary = screen.getByTestId('homepage-primary-cta');
    expect(primary).toHaveAttribute('href', '/start');
    expect(primary).toHaveTextContent(copy.hero.primaryAction);
    expect(screen.getByText(copy.hero.note)).toBeInTheDocument();
    expect(signupEntries(container.innerHTML)).toEqual(['/start']);
  });

  it('keeps the claim-handle action and form when the legacy flag is on', async () => {
    vi.stubEnv('FEATURE_HOMEPAGE_START_CTA', 'true');
    const { copy, anchor, claim } = await load();
    const { container } = await renderHomePage();

    const primary = screen.getByTestId('homepage-primary-cta');
    expect(claim.href).toBe('/start');
    expect(primary).toHaveAttribute('href', claim.href);
    expect(primary).toHaveTextContent('Claim your handle');
    expect(
      container.querySelectorAll('[data-primary-action="true"]')
    ).toHaveLength(1);
    // What the stranger certification check reads from the homepage HTML.
    expect(signupEntries(container.innerHTML)).toEqual(['/start']);

    expect(screen.getByText(copy.hero.note)).toBeInTheDocument();
    // The locked headline, the secondary action and the form are untouched.
    expect(
      screen.getByRole('heading', { level: 1, name: copy.hero.headline })
    ).toBeInTheDocument();
    expect(screen.getByTestId('homepage-hero-live-profile')).toHaveAttribute(
      'href',
      copy.hero.secondaryHref
    );
    const close = container.querySelector(`#${anchor}`);
    const form = close?.querySelector('[data-testid="homepage-claim-entry"]');
    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action', '/start');
  });

  it('keeps /start as the front door while signup availability is gated downstream', async () => {
    vi.stubEnv('FEATURE_HOMEPAGE_START_CTA', 'true');
    vi.stubEnv('FEATURE_PUBLIC_SIGNUP_CLOSED', 'true');
    const { copy } = await load();
    const { container } = await renderHomePage();

    const primary = screen.getByTestId('homepage-primary-cta');
    expect(primary).toHaveAttribute('href', '/start');
    expect(primary).toHaveTextContent(copy.hero.primaryAction);
    expect(signupEntries(container.innerHTML)).toEqual(['/start']);
  });
});
