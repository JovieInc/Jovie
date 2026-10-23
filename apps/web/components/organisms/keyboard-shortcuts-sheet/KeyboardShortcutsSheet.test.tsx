import { render, screen } from '@testing-library/react';
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
import { KeyboardShortcutsSheet } from './KeyboardShortcutsSheet';

vi.mock('next/navigation', () => ({ usePathname: vi.fn(() => '/app') }));

function OpenOnMount() {
  const { open } = useKeyboardShortcuts();
  useEffect(() => {
    open();
  }, [open]);
  return null;
}

function renderSheet(isAdmin: boolean, pathname = '/app') {
  vi.mocked(usePathname).mockReturnValue(pathname);
  return render(
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
    </DashboardDataContext.Provider>
  );
}

describe('KeyboardShortcutsSheet', () => {
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
  expect(view.getByText(/No shortcuts found/i)).toBeInTheDocument();
  await user.click(view.getByRole('button', { name: 'Clear Search' }));
  expect(view.getByText('Open command menu')).toBeInTheDocument();
});
