import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { FleetAuditPanel } from './FleetAuditPanel';
import {
  fleetEvent,
  fleetSummary,
  fleetUnattributed,
} from './fleetAudit.test-fixtures';

afterEach(() => vi.unstubAllGlobals());

const SEARCH = { name: 'Search Fleet Audit By Target' };

describe('FleetAuditPanel certificate', () => {
  it('renders a quiet week with empty sections and stays axe-clean', async () => {
    const { container } = render(<FleetAuditPanel initial={fleetSummary()} />);
    expect(screen.getAllByText('None.').length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it('keeps the typed target and focus through a parent rerender and Escape', async () => {
    const user = userEvent.setup();
    const initial = fleetSummary();
    const { rerender } = render(<FleetAuditPanel initial={initial} />);

    await user.type(screen.getByRole('textbox', SEARCH), 'Jovie#123');
    rerender(<FleetAuditPanel initial={initial} />);

    const input = screen.getByRole('textbox', SEARCH);
    expect(input).toHaveValue('Jovie#123');
    expect(input).toHaveFocus();
    await user.keyboard('{Escape}');
    input.blur();
    expect(input).toHaveValue('Jovie#123');
  });

  it('shows the searching row while the request is in flight', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined))
    );
    const { container } = render(<FleetAuditPanel initial={fleetSummary()} />);

    await user.type(screen.getByRole('textbox', SEARCH), 'Jovie#123');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByText('Searching.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('reports a failed or offline search and keeps the target', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('{}', { status: 500 }))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    );
    const { container } = render(<FleetAuditPanel initial={fleetSummary()} />);

    await user.type(screen.getByRole('textbox', SEARCH), 'Jovie#123');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(
      await screen.findByText('Search failed. Try again shortly.')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(
      await screen.findByText('Search failed. Try again shortly.')
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', SEARCH)).toHaveValue('Jovie#123');
    await expectNoA11yViolations(container);
  });

  it('ignores a blank search without calling the route', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<FleetAuditPanel initial={fleetSummary()} />);

    await user.type(screen.getByRole('textbox', SEARCH), '   ');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('fleet-audit-results')).toBeEmptyDOMElement();
  });

  it('lists dangerous and unattributed activity', async () => {
    const { container } = render(
      <FleetAuditPanel
        initial={fleetSummary({
          dangerous: [fleetEvent],
          unattributed: [fleetUnattributed],
        })}
      />
    );
    expect(screen.getByText(/claude-lane-3/)).toBeInTheDocument();
    expect(screen.getByText(/JovieInc\/Jovie#124/)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
