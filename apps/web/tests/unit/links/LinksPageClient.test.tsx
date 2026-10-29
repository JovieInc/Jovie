import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinkRow } from '@/app/app/(shell)/links/links-model';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';

const { copyToClipboardMock } = vi.hoisted(() => ({
  copyToClipboardMock: vi.fn(),
}));

vi.mock('@/hooks/useClipboard', () => ({
  copyToClipboard: copyToClipboardMock,
}));

import { LinksPageClient } from '@/app/app/(shell)/links/LinksPageClient';

/**
 * The shell owns the right-rail slot (AppShellFrame renders whatever a route
 * registers through RightPanelProvider). Render the page inside a provider
 * with a visible slot so tests can assert the inspector presents through the
 * canonical entity rail instead of a local aside.
 */
function RightPanelSlot() {
  const panel = useRightPanel();
  return <div data-testid='shell-right-panel-slot'>{panel}</div>;
}

function renderLinksWorkspace(ui: ReactElement, reactStrictMode = false) {
  return render(
    <RightPanelProvider>
      {ui}
      <RightPanelSlot />
    </RightPanelProvider>,
    { reactStrictMode }
  );
}

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
    renderLinksWorkspace(<LinksPageClient rows={[]} />);

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

    renderLinksWorkspace(<LinksPageClient rows={rows} />);

    expect(screen.getByTestId('links-workspace')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('social / bio')).toBeInTheDocument();
  });

  it('orders columns identity, status, then action with right-aligned numerics', () => {
    renderLinksWorkspace(<LinksPageClient rows={[baseRow]} />);

    const table = screen.getByRole('table');
    const headers = within(table)
      .getAllByRole('columnheader')
      .map(header => header.textContent);
    expect(headers).toEqual([
      'Entity',
      'Type',
      'Status',
      'Destination',
      'Clicks',
      'Campaign',
      'Jovie link',
    ]);

    // Numeric alignment matches the shared table idiom: right-aligned header
    // and tabular numerals so digit widths stay stable across rows.
    const clicksHeader = within(table).getByRole('columnheader', {
      name: 'Clicks',
    });
    expect(clicksHeader.className).toContain('text-right');

    const firstRow = within(table).getAllByRole('row')[1];
    const clicksCell = within(firstRow).getByText('17');
    expect(clicksCell.className).toContain('text-right');
    expect(clicksCell.className).toContain('tabular-nums');
  });

  it('discloses truncated long values through title attributes', () => {
    renderLinksWorkspace(<LinksPageClient rows={[baseRow]} />);

    expect(screen.getByTitle('Midnight City')).toBeInTheDocument();
    expect(
      screen.getByTitle('https://jov.ie/tim/midnight-city')
    ).toBeInTheDocument();
    expect(
      screen.getByTitle('https://open.spotify.com/album/xyz')
    ).toBeInTheDocument();
  });

  it('opens the inspector for a selected row and copies the Jovie link', async () => {
    const user = userEvent.setup();
    renderLinksWorkspace(<LinksPageClient rows={[baseRow]} />);

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
    renderLinksWorkspace(<LinksPageClient rows={[baseRow]} />);

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
    renderLinksWorkspace(<LinksPageClient rows={[row]} />);

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

  it('presents the inspector through the shell right-rail panel', async () => {
    const user = userEvent.setup();
    renderLinksWorkspace(<LinksPageClient rows={[baseRow]} />);

    await user.click(
      screen.getByRole('button', { name: 'jov.ie/tim/midnight-city' })
    );

    // Entity-rail parity: the inspector must present through the shell's
    // registered right-panel slot, not as a local aside next to the table.
    const slot = screen.getByTestId('shell-right-panel-slot');
    expect(within(slot).getByTestId('links-inspector')).toBeInTheDocument();
    expect(
      within(slot).getByRole('button', { name: 'Close' })
    ).toBeInTheDocument();
  });

  it('closes the inspector on Escape', async () => {
    const user = userEvent.setup();
    renderLinksWorkspace(<LinksPageClient rows={[baseRow]} />);

    await user.click(
      screen.getByRole('button', { name: 'jov.ie/tim/midnight-city' })
    );
    expect(screen.getByTestId('links-inspector')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByTestId('links-inspector')).not.toBeInTheDocument();
    expect(screen.getByTestId('shell-right-panel-slot')).toBeEmptyDOMElement();
  });

  it.each([false, true])(
    'supports the complete keyboard path and returns focus to the originating row (StrictMode=%s)',
    async reactStrictMode => {
      const user = userEvent.setup();
      renderLinksWorkspace(
        <LinksPageClient
          rows={[
            baseRow,
            {
              ...baseRow,
              id: 'row-2',
              title: 'Neon Sky',
              jovieUrl: 'https://jov.ie/tim/neon-sky',
            },
          ]}
        />,
        reactStrictMode
      );

      // Table row → rail: Enter on the row's action control opens the inspector.
      const rowButton = screen.getByRole('button', {
        name: 'jov.ie/tim/neon-sky',
      });
      rowButton.focus();
      await user.keyboard('{Enter}');

      const slot = screen.getByTestId('shell-right-panel-slot');
      expect(within(slot).getByTestId('links-inspector')).toBeInTheDocument();

      // Opening the desktop rail preserves focus on the originating row.
      expect(rowButton).toHaveFocus();

      // The shell renders the rail after the route: Tab from the last row
      // reaches the rail's header actions.
      await user.tab();
      expect(
        within(screen.getByTestId('links-inspector')).getByRole('button', {
          name: 'More actions',
        })
      ).toHaveFocus();

      // Escape → originating row: closing the rail returns focus to the row
      // control that opened it instead of dropping focus on <body>.
      await user.keyboard('{Escape}');
      expect(screen.queryByTestId('links-inspector')).not.toBeInTheDocument();
      expect(document.activeElement).toBe(rowButton);
    }
  );

  it('preserves focus on another live row when the inspector closes', async () => {
    const user = userEvent.setup();
    renderLinksWorkspace(
      <LinksPageClient
        rows={[
          baseRow,
          { ...baseRow, id: 'row-2', jovieUrl: 'https://jov.ie/tim/neon-sky' },
        ]}
      />
    );
    const opener = screen.getByRole('button', {
      name: 'jov.ie/tim/midnight-city',
    });
    opener.focus();
    await user.keyboard('{Enter}');

    const otherRow = screen.getByRole('button', {
      name: 'jov.ie/tim/neon-sky',
    });
    otherRow.focus();
    await user.keyboard('{Escape}');

    expect(screen.queryByTestId('links-inspector')).not.toBeInTheDocument();
    expect(otherRow).toHaveFocus();
  });

  it('switches the inspector content when selecting another row', async () => {
    const user = userEvent.setup();
    renderLinksWorkspace(
      <LinksPageClient
        rows={[
          baseRow,
          {
            ...baseRow,
            id: 'row-2',
            title: 'Neon Sky',
            jovieUrl: 'https://jov.ie/tim/neon-sky',
          },
        ]}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'jov.ie/tim/midnight-city' })
    );
    expect(screen.getByTestId('links-inspector')).toHaveTextContent(
      'Midnight City'
    );

    await user.click(
      screen.getByRole('button', { name: 'jov.ie/tim/neon-sky' })
    );

    const inspector = screen.getByTestId('links-inspector');
    expect(inspector).toHaveTextContent('Neon Sky');
    expect(inspector).not.toHaveTextContent('Midnight City');
  });
});
