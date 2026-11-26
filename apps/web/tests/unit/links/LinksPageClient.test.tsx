import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinkRow } from '@/app/app/(shell)/links/links-model';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import {
  linksBaseRow,
  renderLinksWorkspace,
} from './LinksPageClient.test-utils';

const { copyToClipboardMock } = vi.hoisted(() => ({
  copyToClipboardMock: vi.fn(),
}));

vi.mock('@/hooks/useClipboard', () => ({
  copyToClipboard: copyToClipboardMock,
}));

vi.mock('@/components/feedback', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

import { LinksPageClient } from '@/app/app/(shell)/links/LinksPageClient';

const baseRow = linksBaseRow;

describe('LinksPageClient', () => {
  beforeEach(() => {
    copyToClipboardMock.mockReset();
    copyToClipboardMock.mockResolvedValue(true);
  });

  it('renders the empty state when there are no links', () => {
    renderLinksWorkspace(<LinksPageClient rows={[]} />);

    expect(screen.getByTestId('links-empty-state')).toBeInTheDocument();
    expect(screen.getByText('No Links Yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Releases' })).toHaveAttribute(
      'href',
      '/app/releases'
    );
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
      'Jovie Link',
    ]);

    const clicksHeader = within(table).getByRole('columnheader', {
      name: 'Clicks',
    });
    expect(clicksHeader.className).toContain('text-right');

    const firstRow = within(table).getAllByRole('row')[1];
    const clicksValue = within(firstRow).getByText('17');
    expect(clicksValue.className).toContain('tabular-nums');
    expect(clicksValue.closest('td')?.className).toContain('text-right');
  });

  it('renders through the shared UnifiedTable with dense shared rows', () => {
    renderLinksWorkspace(
      <LinksPageClient rows={[baseRow, { ...baseRow, id: 'row-2' }]} />
    );

    const table = screen.getByRole('table');
    expect(table).toHaveAttribute('data-table-row-mode', 'dense');
    const row = screen.getByTestId('links-row-row-1');
    expect(row.className).toContain('system-b-table-row-shell');
    expect(row.className).toContain('system-b-table-row-hover');
    expect(row.className).toContain('system-b-table-row-focus-visible');
  });

  it('aligns every header with its column', () => {
    renderLinksWorkspace(<LinksPageClient rows={[baseRow]} />);

    const table = screen.getByRole('table');
    const headers = within(table).getAllByRole('columnheader');
    const cells = within(within(table).getAllByRole('row')[1]).getAllByRole(
      'cell'
    );
    expect(cells).toHaveLength(headers.length);
    headers.forEach((header, index) => {
      const headerRight = header.className.includes('text-right');
      const cellRight = cells[index].className.includes('text-right');
      expect(cellRight, header.textContent ?? '').toBe(headerRight);
    });
  });

  it('fixes column widths so long values truncate instead of widening columns', () => {
    renderLinksWorkspace(<LinksPageClient rows={[baseRow]} />);

    const table = screen.getByRole('table');
    expect(table).toHaveClass('table-fixed');
    expect(table.querySelectorAll('colgroup col')).toHaveLength(
      within(table).getAllByRole('columnheader').length
    );
  });

  it('moves the open inspector to the focused row after a sort', async () => {
    const user = userEvent.setup();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    renderLinksWorkspace(
      <LinksPageClient
        rows={[
          { ...baseRow, id: 'row-a', title: 'Midnight City', clicks: 5 },
          { ...baseRow, id: 'row-b', title: 'Neon Sky', clicks: 50 },
          { ...baseRow, id: 'row-c', title: 'Afterglow', clicks: 20 },
        ]}
      />
    );

    await user.click(
      screen.getByRole('button', {
        name: 'Clicks: not sorted, activate to sort',
      })
    );
    const bodyRows = within(screen.getByRole('table'))
      .getAllByRole('row')
      .slice(1);
    const order = bodyRows.map(row => row.getAttribute('data-testid'));
    expect(order).not.toEqual([
      'links-row-row-a',
      'links-row-row-b',
      'links-row-row-c',
    ]);

    await user.click(within(bodyRows[0]).getAllByRole('cell')[1]);
    const expectedNext = bodyRows[1];
    bodyRows[0].focus();
    await user.keyboard('{ArrowDown}');

    const nextTitle =
      within(expectedNext).getAllByRole('cell')[0].textContent ?? '';
    expect(screen.getByTestId('links-inspector')).toHaveTextContent(nextTitle);
    expect(expectedNext).toHaveAttribute('aria-selected', 'true');
  });

  it('opens the inspector from a row click and marks the row selected', async () => {
    const user = userEvent.setup();
    renderLinksWorkspace(<LinksPageClient rows={[baseRow]} />);

    const row = screen.getByTestId('links-row-row-1');
    await user.click(within(row).getByText('Release'));

    expect(screen.getByTestId('links-inspector')).toHaveTextContent(
      'Midnight City'
    );
    expect(row).toHaveAttribute('aria-selected', 'true');
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

  it('opens the inspector for a selected row with one-action Copy Tracked Link', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Copy Tracked Link' }));
    expect(copyToClipboardMock).toHaveBeenCalled();
    expect(
      await screen.findByRole('button', { name: 'Copied Tracked Link' })
    ).toBeInTheDocument();
  });

  it('keeps Copy Tracked Link when the clipboard write fails from the rail', async () => {
    copyToClipboardMock.mockResolvedValue(false);
    const user = userEvent.setup();
    renderLinksWorkspace(<LinksPageClient rows={[baseRow]} />);

    await user.click(
      screen.getByRole('button', { name: 'jov.ie/tim/midnight-city' })
    );
    await user.click(screen.getByRole('button', { name: 'Copy Tracked Link' }));

    expect(copyToClipboardMock).toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Copy Tracked Link' })
    ).toBeInTheDocument();
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

      const rowButton = screen.getByRole('button', {
        name: 'jov.ie/tim/neon-sky',
      });
      rowButton.focus();
      await user.keyboard('{Enter}');

      const slot = screen.getByTestId('shell-right-panel-slot');
      expect(within(slot).getByTestId('links-inspector')).toBeInTheDocument();
      expect(rowButton).toHaveFocus();

      await user.tab();
      expect(
        within(screen.getByTestId('links-inspector')).getByRole('button', {
          name: 'More actions',
        })
      ).toHaveFocus();

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

  it('keeps the registered inspector element stable across page renders', async () => {
    const user = userEvent.setup();
    const panels: unknown[] = [];
    function PanelProbe() {
      panels.push(useRightPanel());
      return null;
    }
    const rows = [baseRow];
    const view = () => (
      <RightPanelProvider>
        <LinksPageClient rows={rows} />
        <PanelProbe />
      </RightPanelProvider>
    );
    const { rerender } = render(view());

    await user.click(screen.getByText('Midnight City'));
    const openPanel = panels.at(-1);
    expect(openPanel).not.toBeNull();
    const rendersWhileOpen = panels.length;

    rerender(view());
    rerender(view());

    expect(panels.at(-1)).toBe(openPanel);
    expect(panels.length - rendersWhileOpen).toBe(2);
  });
});
