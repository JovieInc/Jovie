import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  DashboardDataContext,
  type DashboardDataContextValue,
} from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { FounderDoorProvider } from '@/contexts/FounderDoorContext';
import {
  KeyboardShortcutsProvider,
  useKeyboardShortcuts,
} from '@/contexts/KeyboardShortcutsContext';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { KeyboardShortcutsSheet } from './KeyboardShortcutsSheet';

vi.mock('next/navigation', () => ({ usePathname: vi.fn(() => '/app') }));

function OpenOnMount() {
  const { open } = useKeyboardShortcuts();
  useEffect(() => {
    open();
  }, [open]);
  return null;
}

function SheetTree({
  isAdmin,
  tick = 0,
}: {
  readonly isAdmin: boolean;
  readonly tick?: number;
}) {
  return (
    <DashboardDataContext.Provider
      value={
        {
          isAdmin,
          identities: [],
          activeIdentity: null,
        } as unknown as DashboardDataContextValue
      }
    >
      <FounderDoorProvider>
        <KeyboardShortcutsProvider>
          <OpenOnMount />
          <KeyboardShortcutsSheet />
        </KeyboardShortcutsProvider>
      </FounderDoorProvider>
      <span data-tick={tick} hidden />
    </DashboardDataContext.Provider>
  );
}

function renderSheet(isAdmin: boolean, pathname = '/app') {
  vi.mocked(usePathname).mockReturnValue(pathname);
  return render(<SheetTree isAdmin={isAdmin} />);
}

describe('KeyboardShortcutsSheet', () => {
  it('shows active operator sequences instead of customer sequences on Ovie', () => {
    const customer = renderSheet(true, '/app');
    expect(screen.getByText('Go to contacts')).toBeInTheDocument();
    customer.unmount();

    renderSheet(true, '/app/ov/ops');
    expect(screen.getByText('Go to home')).toBeInTheDocument();
    expect(screen.getByText('Go to inbox')).toBeInTheDocument();
    expect(screen.getByText('Go to shipping')).toBeInTheDocument();
    expect(screen.getByText('Go to fleet')).toBeInTheDocument();
    expect(screen.getByText('Go to capacity')).toBeInTheDocument();
    expect(screen.queryByText('Go to contacts')).not.toBeInTheDocument();
    expect(screen.getByText('Open command menu')).toBeInTheDocument();
  });

  it('lists Toggle Ovie / Jovie for entitled users only', () => {
    const entitled = renderSheet(true);
    expect(entitled.getByText('Toggle Ovie / Jovie')).toBeInTheDocument();
    entitled.unmount();

    renderSheet(false);
    expect(screen.queryByText('Toggle Ovie / Jovie')).not.toBeInTheDocument();
    expect(screen.getByText('Open command menu')).toBeInTheDocument();
  });

  it('advertises workspace lock only in Ovie', () => {
    const jovie = renderSheet(true, '/app/chat');
    expect(screen.queryByText('Lock workspace')).not.toBeInTheDocument();
    jovie.unmount();

    renderSheet(true, '/app/ov/ops');
    expect(screen.getByText('Lock workspace')).toBeInTheDocument();
  });
});

it('renders 32px shortcut rows', () => {
  const view = renderSheet(false);
  const row = view.getByText('Open command menu').closest('div.group');
  expect(row).not.toBeNull();
  expect(row).toHaveClass('h-8');
});

it('offers a Clear Search next step from the no-results state', async () => {
  const view = renderSheet(false);
  const user = userEvent.setup();
  const input = view.getByPlaceholderText('Search shortcuts');
  await user.type(input, 'zzzz-no-such-shortcut');
  const noResults = view
    .getByText(/No shortcuts found/i)
    .closest('div.flex-col') as HTMLElement;
  expect(noResults).not.toBeNull();
  // Scope to the no-results card: the search input's own clear icon button
  // also reads "Clear Search".
  await user.click(
    within(noResults).getByRole('button', { name: 'Clear Search' })
  );
  expect(view.getByText('Open command menu')).toBeInTheDocument();
});

it('is axe-clean with results and in the no-results state', async () => {
  renderSheet(false);
  const user = userEvent.setup();
  const sheet = screen.getByRole('dialog');
  await expectNoA11yViolations(sheet);

  await user.type(screen.getByPlaceholderText('Search shortcuts'), 'zzzz');
  expect(screen.getByText(/No shortcuts found/)).toBeInTheDocument();
  await expectNoA11yViolations(sheet);
});

// Escape is excluded on purpose: it is the sheet's dismiss key (Radix closes
// the dialog and handleOpenChange clears the query), so a typed query is not
// expected to survive it. Retention is asserted across a parent rerender and
// a blur, which must never touch the query or move focus on their own.
it('keeps the typed query and focus through a parent rerender and blur', async () => {
  vi.mocked(usePathname).mockReturnValue('/app');
  const view = render(<SheetTree isAdmin={false} tick={0} />);
  const user = userEvent.setup();
  const input = screen.getByPlaceholderText('Search shortcuts');

  await user.type(input, 'command');
  expect(input).toHaveValue('command');
  expect(input).toHaveFocus();

  view.rerender(<SheetTree isAdmin={false} tick={1} />);
  const afterRerender = screen.getByPlaceholderText('Search shortcuts');
  expect(afterRerender).toBe(input);
  expect(afterRerender).toHaveValue('command');
  expect(afterRerender).toHaveFocus();

  fireEvent.blur(afterRerender);
  expect(afterRerender).toHaveValue('command');
  expect(screen.getByText('Open command menu')).toBeInTheDocument();
});
