import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.select,
    update: mocks.update,
    insert: mocks.insert,
  },
}));
vi.mock('@/lib/db/schema/investors', () => ({
  investorLinks: {
    id: 'id',
    stage: 'stage',
    expiresAt: 'expiresAt',
    token: 'token',
    isActive: 'isActive',
  },
  investorViews: { investorLinkId: 'investorLinkId', pagePath: 'pagePath' },
}));

import { InvestorStickyBar } from '@/app/investor-portal/_components/InvestorStickyBar';
import InvestorRespondPage from '@/app/investor-portal/respond/page';

function searchParams(value: { t?: string; action?: string }) {
  return Promise.resolve(value);
}

describe('investor respond page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [
            { id: 'link-1', stage: 'viewed', expiresAt: null },
          ],
        }),
      }),
    });
    mocks.update.mockReturnValue({ set: () => ({ where: async () => [] }) });
    mocks.insert.mockReturnValue({ values: async () => [] });
  });

  it('records a call request instead of redirecting to a calendar', async () => {
    render(
      await InvestorRespondPage({
        searchParams: searchParams({ t: 'tok', action: 'interested' }),
      })
    );

    expect(mocks.insert).toHaveBeenCalled();
    expect(
      screen.getByRole('heading', { name: 'Thanks for your interest!' })
    ).toBeInTheDocument();
  });

  it('marks the link passed without recording a call request', async () => {
    render(
      await InvestorRespondPage({
        searchParams: searchParams({ t: 'tok', action: 'pass' }),
      })
    );

    expect(mocks.insert).not.toHaveBeenCalled();
    expect(
      screen.getByRole('heading', { name: 'Thanks for letting us know' })
    ).toBeInTheDocument();
  });

  it('404s without a valid action', async () => {
    await expect(
      InvestorRespondPage({ searchParams: searchParams({ t: 'tok' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('InvestorStickyBar', () => {
  it('renders a Request a call button that records the event', () => {
    render(
      <InvestorStickyBar
        investUrl={null}
        showProgress={false}
        raiseTarget={null}
        committedAmount={null}
        investorCount={null}
      />
    );

    const button = screen.getByRole('button', { name: 'Request a call' });
    expect(button).toHaveAttribute('data-pitch-event', 'call_requested');
  });

  it('renders the Invest link when a URL is configured', () => {
    render(
      <InvestorStickyBar
        investUrl='https://example.com/invest'
        showProgress={false}
        raiseTarget={null}
        committedAmount={null}
        investorCount={null}
      />
    );

    expect(screen.getByRole('link', { name: 'Invest' })).toHaveAttribute(
      'href',
      'https://example.com/invest'
    );
  });
});
