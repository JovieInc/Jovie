import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES } from '@/components/features/home/homepage-profile-preview-fixture';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  PublicProfileFixture,
  type PublicProfileFixtureProps,
} from './PublicProfileFixture';

// The real compact template renders here (PublicProfileFixture.test.tsx stubs
// it). Assignment and claim requests reach a failing fetch, so nothing leaves
// the test, and a phone-width sheet hides the desktop shell the way
// design-system.css does below 1180px, so axe audits the page a visitor sees.
let phoneSheet: HTMLStyleElement | null = null;

function renderFixture(props: PublicProfileFixtureProps = {}, dir?: 'rtl') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <div dir={dir}>
        <PublicProfileFixture {...props} />
      </div>
    </QueryClientProvider>
  );
}

describe('PublicProfileFixture: certificate states', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );
    phoneSheet = document.createElement('style');
    phoneSheet.textContent =
      '.public-profile-layout-desktop-shell { display: none; }';
    document.head.append(phoneSheet);
  });

  afterEach(() => {
    phoneSheet?.remove();
    vi.unstubAllGlobals();
  });

  it.each<[string, PublicProfileFixtureProps]>([
    ['unclaimed', {}],
    ['claimed', { state: 'claimed' }],
    ['long-name', { longName: true }],
    ['no tour dates', { tourDates: [] }],
    [
      'one tour date',
      { tourDates: HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES.slice(0, 1) },
    ],
  ])('has no axe violations for the %s fixture', async (_label, props) => {
    const { container } = renderFixture(props);

    expect(
      await screen.findByTestId('profile-compact-surface')
    ).toHaveAttribute('data-mode', 'profile');
    await expectNoA11yViolations(container);
  });

  it('has no axe violations right to left', async () => {
    const { container } = renderFixture(
      { displayName: 'أنفيزد', state: 'claimed' },
      'rtl'
    );

    expect(
      await screen.findByTestId('profile-compact-surface')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
