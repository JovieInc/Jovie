import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  insertValues: vi.fn(async () => []),
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

const CLAIM_TOKEN = 'a'.repeat(43);
const LIVE_EXPIRY = new Date('2099-01-01T00:00:00.000Z');

function searchParams(value: { t?: string; action?: string }) {
  return Promise.resolve(value);
}

function mockLink(stage: string) {
  mocks.select.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: async () => [{ id: 'link-1', stage, expiresAt: LIVE_EXPIRY }],
      }),
    }),
  });
}

describe('investor respond page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLink('viewed');
    mocks.update.mockReturnValue({ set: () => ({ where: async () => [] }) });
    mocks.insert.mockReturnValue({ values: mocks.insertValues });
  });

  it('records a call request instead of redirecting to a calendar', async () => {
    render(
      await InvestorRespondPage({
        searchParams: searchParams({ t: CLAIM_TOKEN, action: 'interested' }),
      })
    );

    expect(mocks.update).toHaveBeenCalled();
    expect(mocks.insertValues).toHaveBeenCalledWith({
      investorLinkId: 'link-1',
      pagePath: '/investor-portal#event/call_requested',
    });
    expect(
      screen.getByRole('heading', { name: 'Thanks for your interest!' })
    ).toBeInTheDocument();
  });

  it('does not record another call request from a terminal stage', async () => {
    mockLink('committed');

    render(
      await InvestorRespondPage({
        searchParams: searchParams({ t: CLAIM_TOKEN, action: 'interested' }),
      })
    );

    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(
      screen.getByRole('heading', { name: 'Thanks for your interest!' })
    ).toBeInTheDocument();
  });

  it('marks the link passed without recording a call request', async () => {
    render(
      await InvestorRespondPage({
        searchParams: searchParams({ t: CLAIM_TOKEN, action: 'pass' }),
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
