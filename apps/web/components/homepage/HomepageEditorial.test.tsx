import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  HOMEPAGE_EDITORIAL_COPY,
  HOMEPAGE_INVITE_ANCHOR,
} from '@/data/homepageEditorialCopy';
import { getClaimProfileIntent } from '@/data/marketingCtaIntents';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

// Per-chapter rendered-state and accessibility coverage. The page-level copy,
// route and imagery contract lives in tests/unit/home/homepage-contract.test.tsx.
vi.mock('@/components/atoms/InvisibleTurnstile', () => ({
  InvisibleTurnstile: () => null,
  isTurnstileClientBypassed: () => true,
  isTurnstileClientConfigured: () => false,
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn(), page: vi.fn() }));
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, quality, ...rest } = props;
    void fill;
    void priority;
    void quality;
    return <img alt='' {...rest} />;
  },
}));

import {
  HomepageInviteClose,
  HomepageProfileChapter,
  HomepageReleasesChapter,
  HomepageStoryHero,
} from './HomepageEditorial';

const COPY = HOMEPAGE_EDITORIAL_COPY;

describe('HomepageEditorial chapters', () => {
  it('renders the hero as one labelled section with the locked headline and two actions', async () => {
    const { container } = render(<HomepageStoryHero />);

    const hero = screen.getByTestId('marketing-section-hero');
    expect(hero).toHaveAttribute('aria-labelledby', 'home-hero-heading');
    expect(
      screen.getByRole('heading', { level: 1, name: COPY.hero.headline })
    ).toHaveAttribute('id', 'home-hero-heading');
    expect(screen.getByTestId('homepage-primary-cta')).toHaveAttribute(
      'href',
      '/start'
    );
    expect(screen.getByTestId('homepage-hero-live-profile')).toHaveAttribute(
      'href',
      COPY.hero.secondaryHref
    );
    expect(
      screen.getByRole('img', { name: COPY.hero.windowLabel })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows the selected release page beside the app, with no label across the list', () => {
    const { container } = render(<HomepageStoryHero />);

    const page = container.querySelector('.hv3-lift--page');
    expect(page).toHaveAttribute('aria-hidden', 'true');
    expect(page?.querySelector('[data-hv3-anchor="htitle"]')).not.toBeNull();
    expect(
      container.querySelector('.hv3-stage--hero [data-hv3-callout]')
    ).toBeNull();
    expect(container.querySelector('.hv3-lift--inspector')).toBeNull();
  });

  it('indexes every chapter and reaches the hero actions by keyboard', async () => {
    const user = userEvent.setup();
    render(<HomepageStoryHero />);

    const index = screen.getByRole('navigation', { name: COPY.chaptersLabel });
    expect(
      within(index)
        .getAllByRole('link')
        .map(link => link.getAttribute('href'))
    ).toEqual([
      '#feature-split',
      '#product-gallery',
      '#specs',
      `#${HOMEPAGE_INVITE_ANCHOR}`,
    ]);

    await user.tab();
    expect(screen.getByTestId('homepage-primary-cta')).toHaveFocus();
    await user.tab();
    expect(screen.getByTestId('homepage-hero-live-profile')).toHaveFocus();
  });

  it('renders the profile chapter with its rows as a description list', async () => {
    const { container } = render(<HomepageProfileChapter />);

    expect(
      screen.getByRole('heading', { level: 2, name: COPY.profile.headline })
    ).toBeInTheDocument();
    for (const row of COPY.profile.rows) {
      expect(screen.getByText(row.label).tagName).toBe('DT');
      expect(screen.getByText(row.value).tagName).toBe('DD');
    }
    await expectNoA11yViolations(container);
  });

  it('renders the releases chapter with labelled product imagery and captions', async () => {
    const { container } = render(<HomepageReleasesChapter />);

    expect(
      screen.getByRole('heading', { level: 2, name: COPY.releases.headline })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: COPY.releases.catalogLabel })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: COPY.releases.releasePageLabel })
    ).toBeInTheDocument();
    // Three captions plus the mock release page's own title, all under the h2.
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(4);
    await expectNoA11yViolations(container);
  });

  it('closes on the claim form and the three numbered steps', async () => {
    const { container } = render(<HomepageInviteClose />);

    const section = screen.getByTestId('marketing-section-cta');
    expect(section).toHaveAttribute('id', HOMEPAGE_INVITE_ANCHOR);
    expect(
      screen.getAllByRole('button', { name: COPY.invite.action }).length
    ).toBeGreaterThan(0);
    const steps = within(section).getAllByRole('listitem');
    expect(steps).toHaveLength(COPY.invite.steps.length);
    expect(steps[0]).toHaveTextContent(`01${COPY.invite.steps[0].title}`);
    await expectNoA11yViolations(container);
  });

  it('wraps long caller copy without dropping any of it', async () => {
    const headline =
      'One name that every listener, promoter, label and playlist editor finds the same way, everywhere.';
    const body =
      'Your profile at jov.ie leads with what matters now: your latest release, your links, the shows you have coming up and a way for listeners to get updates. '.repeat(
        2
      );
    const { container } = render(
      <HomepageProfileChapter copy={{ headline, body }} />
    );

    expect(
      screen.getByRole('heading', { level: 2, name: headline })
    ).toHaveClass('text-balance');
    expect(screen.getByText(body.trim())).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders the hero and a translated chapter in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <HomepageStoryHero
          copy={{ ...COPY.hero, subhead: 'ملفك وكل إصدار ورابط لكل منصة.' }}
        />
        <HomepageProfileChapter
          copy={{
            headline: 'اسم واحد. في كل مكان.',
            body: 'ملفك يقود بالجديد.',
          }}
        />
      </div>
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'اسم واحد. في كل مكان.' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('ملفك وكل إصدار ورابط لكل منصة.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps the claim action and free-start note in both legacy flag modes', async () => {
    const off = render(<HomepageStoryHero />);
    const invite = screen.getByTestId('homepage-primary-cta');
    expect(invite).toHaveAttribute('href', COPY.hero.primaryHref);
    expect(invite).toHaveTextContent(COPY.hero.primaryAction);
    expect(screen.getByText(COPY.hero.note)).toBeInTheDocument();
    off.unmount();

    vi.stubEnv('FEATURE_HOMEPAGE_START_CTA', 'true');
    try {
      const claim = getClaimProfileIntent();
      const { container } = render(<HomepageStoryHero />);
      const start = screen.getByTestId('homepage-primary-cta');
      expect(start).toHaveAttribute('href', '/start');
      expect(start).toHaveAttribute('href', claim.href);
      expect(start).toHaveAttribute('data-primary-action', 'true');
      expect(start).toHaveTextContent(COPY.hero.primaryAction);
      expect(screen.getByText(COPY.hero.note)).toBeInTheDocument();
      expect(screen.getByTestId('homepage-hero-live-profile')).toHaveAttribute(
        'href',
        COPY.hero.secondaryHref
      );
      await expectNoA11yViolations(container);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

it('keeps the handle and focus through a parent update, Escape, and blur', async () => {
  const user = userEvent.setup();
  const { container, rerender } = render(<HomepageInviteClose />);
  const input = screen.getByRole('textbox', { name: 'Your handle' });
  await user.type(input, 'myhandle');
  rerender(
    <HomepageInviteClose
      copy={{ headline: 'Claim your handle.', subhead: 'Your page is ready.' }}
    />
  );
  expect(input).toHaveValue('myhandle');
  expect(input).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(input).toHaveValue('myhandle');
  expect(input).toHaveFocus();
  await user.tab();
  expect(input).toHaveValue('myhandle');
  expect(
    screen.getByRole('button', { name: 'Claim your handle' })
  ).toHaveFocus();
  const form = container.querySelector('form');
  expect(form).toHaveAttribute('action', '/start');
  expect(form).toHaveAttribute('method', 'get');
  expect(new FormData(form ?? undefined).get('handle')).toBe('myhandle');
  await expectNoA11yViolations(container);
});
