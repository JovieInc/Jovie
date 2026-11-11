import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MARKETING_PAGE_CONTRACTS,
  type MarketingPageContract,
} from '@/data/marketing/pageContracts';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MarketingPageContractMarkers } from './MarketingPageContractMarkers';

const pathname = vi.hoisted(() => ({ current: '/' as string | null }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
}));

const HOME = MARKETING_PAGE_CONTRACTS['(home)/page.tsx'];

const RECORD_CONTRACT: MarketingPageContract = {
  routeGlob: '(marketing)/solutions/[audience]/page.tsx',
  url: '/solutions/artists',
  copyScope: 'music',
  job: 'show artists how profiles connect music, links, and fan updates',
  proof: 'profile gallery and capture flow',
  successEvent: 'artist claims a profile',
  primaryCta: { href: '/signup', label: 'Claim your profile' },
  recordFamily: 'solutions',
};

function marker(container: HTMLElement) {
  return container.querySelector<HTMLElement>('[data-page-job]');
}

describe('MarketingPageContractMarkers', () => {
  beforeEach(() => {
    pathname.current = '/';
  });

  it('renders the hidden homepage contract for the current route', async () => {
    const { container } = render(<MarketingPageContractMarkers />);

    const node = marker(container);
    expect(node).not.toBeNull();
    expect(node).toHaveAttribute('hidden');
    expect(node).toHaveAttribute('aria-hidden', 'true');
    expect(node).toHaveAttribute('data-page-job', HOME.job);
    expect(node).toHaveAttribute('data-proof', HOME.proof);
    expect(node).toHaveAttribute('data-success-event', HOME.successEvent);
    expect(node).toHaveAttribute('data-copy-scope', HOME.copyScope);

    const cta = container.querySelector('[data-primary-cta="true"]');
    expect(cta).toHaveAttribute('href', HOME.primaryCta.href);
    expect(cta).toHaveTextContent(HOME.primaryCta.label);
    await expectNoA11yViolations(container);
  });

  it('keeps the hidden CTA out of the tab order and the accessibility tree', async () => {
    render(
      <>
        <button type='button'>Before</button>
        <MarketingPageContractMarkers />
        <button type='button'>After</button>
      </>
    );

    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Before' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
    expect(
      screen.queryByRole('link', { name: HOME.primaryCta.label })
    ).not.toBeInTheDocument();
  });

  it('treats the prerendered /index key as the homepage', () => {
    pathname.current = '/index';
    const { container } = render(<MarketingPageContractMarkers />);

    expect(marker(container)).toHaveAttribute('data-page-job', HOME.job);
  });

  it('renders nothing for a route without a contract', async () => {
    pathname.current = '/definitely-not-a-marketing-page';
    const { container } = render(<MarketingPageContractMarkers />);

    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('leaves a record-family route to its record contract', () => {
    pathname.current = '/solutions/artists';
    const { container } = render(<MarketingPageContractMarkers />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders a record contract passed by its family route', async () => {
    pathname.current = '/solutions/artists';
    const { container } = render(
      <MarketingPageContractMarkers contract={RECORD_CONTRACT} />
    );

    const node = marker(container);
    expect(node).toHaveAttribute('data-page-job', RECORD_CONTRACT.job);
    expect(node).toHaveAttribute('data-copy-scope', 'music');
    expect(
      container.querySelector('[data-primary-cta="true"]')
    ).toHaveAttribute('href', '/signup');
    await expectNoA11yViolations(container);
  });
});
