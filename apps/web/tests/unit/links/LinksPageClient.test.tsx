import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinkRow } from '@/app/app/(shell)/links/links-model';

const { copyToClipboardMock } = vi.hoisted(() => ({
  copyToClipboardMock: vi.fn(),
}));

vi.mock('@/hooks/useClipboard', () => ({
  copyToClipboard: copyToClipboardMock,
}));

import { LinksPageClient } from '@/app/app/(shell)/links/LinksPageClient';

const baseRow: LinkRow = {
  id: 'row-1',
  jovieUrl: 'https://jov.ie/tim/midnight-city',
  title: 'Midnight City',
  type: 'Release',
  destination: 'https://open.spotify.com/album/xyz',
  status: 'active',
  clicks: 17,
  clicksLabel: '7d clicks',
  campaign: 'Fall Tour',
  utmSummary: 'qr_code / print',
  entityHref: '/app/releases/release-9',
  createdAt: null,
};

describe('LinksPageClient', () => {
  beforeEach(() => {
    copyToClipboardMock.mockReset();
    copyToClipboardMock.mockResolvedValue(true);
  });

  it('renders the empty state when there are no links', () => {
    render(<LinksPageClient rows={[]} />);

    expect(screen.getByTestId('links-empty-state')).toBeInTheDocument();
    expect(screen.getByText('No links yet')).toBeInTheDocument();
  });

  it('renders each row with status, clicks, and campaign fallbacks', () => {
    const rows: LinkRow[] = [
      baseRow,
      {
        ...baseRow,
        id: 'row-2',
        title: 'Draft single',
        status: 'draft',
        clicks: null,
        campaign: null,
        utmSummary: null,
        entityHref: null,
      },
      {
        ...baseRow,
        id: 'row-3',
        title: 'Scheduled drop',
        status: 'scheduled',
        campaign: null,
        utmSummary: 'social / bio',
      },
      {
        ...baseRow,
        id: 'row-4',
        title: 'Old poster',
        status: 'archived',
      },
    ];

    render(<LinksPageClient rows={rows} />);

    expect(screen.getByTestId('links-workspace')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('social / bio')).toBeInTheDocument();
  });

  it('opens the inspector for a selected row and copies the Jovie link', async () => {
    const user = userEvent.setup();
    render(<LinksPageClient rows={[baseRow]} />);

    await user.click(
      screen.getByRole('button', { name: 'jov.ie/tim/midnight-city' })
    );

    const inspector = screen.getByTestId('links-inspector');
    expect(inspector).toBeInTheDocument();
    expect(inspector).toHaveTextContent('Midnight City');
    expect(inspector).toHaveTextContent('17 7d clicks');
    expect(inspector).toHaveTextContent('Fall Tour');
    expect(inspector).toHaveTextContent('utm: qr_code / print');
    expect(screen.getByRole('link', { name: /open entity/i })).toHaveAttribute(
      'href',
      '/app/releases/release-9'
    );

    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(copyToClipboardMock).toHaveBeenCalledWith(
      'https://jov.ie/tim/midnight-city'
    );
    expect(
      await screen.findByRole('button', { name: 'Copied' })
    ).toBeInTheDocument();
  });

  it('keeps the Copy label when the clipboard write fails', async () => {
    copyToClipboardMock.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<LinksPageClient rows={[baseRow]} />);

    await user.click(
      screen.getByRole('button', { name: 'jov.ie/tim/midnight-city' })
    );
    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(copyToClipboardMock).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('omits entity link and optional fields when the row lacks them', async () => {
    const user = userEvent.setup();
    const row: LinkRow = {
      ...baseRow,
      entityHref: null,
      campaign: null,
      utmSummary: null,
      clicks: null,
    };
    render(<LinksPageClient rows={[row]} />);

    await user.click(
      screen.getByRole('button', { name: 'jov.ie/tim/midnight-city' })
    );

    const inspector = screen.getByTestId('links-inspector');
    expect(inspector).not.toHaveTextContent('Campaign');
    expect(inspector).not.toHaveTextContent('utm:');
    expect(inspector).toHaveTextContent('—');
    expect(
      screen.queryByRole('link', { name: /open entity/i })
    ).not.toBeInTheDocument();
  });
});
