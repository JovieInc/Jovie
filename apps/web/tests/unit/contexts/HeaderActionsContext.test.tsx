import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useMemo, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OPEN_HEADER_SEARCH_EVENT } from '@/components/shell/header-search-events';
import type { HeaderSearchAdapter } from '@/contexts/HeaderActionsContext';
import {
  HeaderActionsProvider,
  useHeaderActions,
  useOptionalHeaderActions,
  useRegisterHeaderActions,
  useRegisterHeaderSearch,
} from '@/contexts/HeaderActionsContext';

function HeaderActionsProbe() {
  const state = useOptionalHeaderActions();

  return <div data-testid='header-actions-probe'>{state?.headerActions}</div>;
}

function RouteActionRegistration({
  children,
}: {
  readonly children: ReactNode;
}) {
  useRegisterHeaderActions(children);
  return null;
}

function ToggleRouteActions() {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <button type='button' onClick={() => setExpanded(value => !value)}>
        Toggle
      </button>
      <RouteActionRegistration>
        <button type='button'>
          {expanded ? 'Expanded Action' : 'Base Action'}
        </button>
      </RouteActionRegistration>
    </>
  );
}

function SearchProbe() {
  const { closeSearch, isSearchOpen } = useHeaderActions();

  return (
    <>
      <output>{isSearchOpen ? 'open' : 'closed'}</output>
      <button type='button' onClick={closeSearch}>
        Close search
      </button>
    </>
  );
}

function SearchAdapterRegistration({ adapterKey }: { adapterKey: string }) {
  const adapter = useMemo<HeaderSearchAdapter>(
    () => ({
      key: adapterKey,
      pills: [],
      onPillsChange: () => {},
      artistOptions: [],
      titleOptions: [],
      albumOptions: [],
      totalCount: 0,
      triggerLabel: 'Filter current view',
    }),
    [adapterKey]
  );
  useRegisterHeaderSearch(adapter);
  return null;
}

describe('HeaderActionsContext', () => {
  it('registers and clears route-owned header actions', () => {
    const view = render(
      <HeaderActionsProvider>
        <RouteActionRegistration>
          <button type='button'>New Task</button>
        </RouteActionRegistration>
        <HeaderActionsProbe />
      </HeaderActionsProvider>
    );

    expect(screen.getByRole('button', { name: 'New Task' })).toBeDefined();

    view.rerender(
      <HeaderActionsProvider>
        <HeaderActionsProbe />
      </HeaderActionsProvider>
    );

    expect(screen.queryByRole('button', { name: 'New Task' })).toBeNull();
  });

  it('updates the registered actions when route state changes', () => {
    render(
      <HeaderActionsProvider>
        <ToggleRouteActions />
        <HeaderActionsProbe />
      </HeaderActionsProvider>
    );

    expect(screen.getByRole('button', { name: 'Base Action' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle' }));

    expect(
      screen.getByRole('button', { name: 'Expanded Action' })
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Base Action' })).toBeNull();
  });

  it('opens from the shell search event and restores the exact prior focus on close', async () => {
    const user = userEvent.setup();
    render(
      <HeaderActionsProvider>
        <button type='button'>Sidebar Search</button>
        <SearchProbe />
      </HeaderActionsProvider>
    );

    const priorFocus = screen.getByRole('button', { name: 'Sidebar Search' });
    await user.click(priorFocus);
    act(() => {
      globalThis.dispatchEvent(new Event(OPEN_HEADER_SEARCH_EVENT));
    });

    expect(screen.getByText('open')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close search' }));
    await waitFor(() => expect(priorFocus).toHaveFocus());
  });

  it('uses slash to open unless focus is already in an editable control', async () => {
    const user = userEvent.setup();
    render(
      <HeaderActionsProvider>
        <input aria-label='Composer' />
        <button type='button'>Canvas</button>
        <SearchProbe />
      </HeaderActionsProvider>
    );

    const composer = screen.getByRole('textbox', { name: 'Composer' });
    await user.click(composer);
    fireEvent.keyDown(composer, { key: '/' });
    expect(screen.getByText('closed')).toBeInTheDocument();

    const canvas = screen.getByRole('button', { name: 'Canvas' });
    await user.click(canvas);
    fireEvent.keyDown(canvas, { key: '/' });
    expect(screen.getByText('open')).toBeInTheDocument();
  });

  it('cancels pending focus restoration when search reopens', () => {
    const requestFrame = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockReturnValue(42);
    const cancelFrame = vi
      .spyOn(globalThis, 'cancelAnimationFrame')
      .mockImplementation(() => {});

    render(
      <HeaderActionsProvider>
        <button type='button'>Sidebar Search</button>
        <SearchProbe />
      </HeaderActionsProvider>
    );

    const priorFocus = screen.getByRole('button', { name: 'Sidebar Search' });
    priorFocus.focus();
    act(() => {
      globalThis.dispatchEvent(new Event(OPEN_HEADER_SEARCH_EVENT));
    });

    const closeButton = screen.getByRole('button', { name: 'Close search' });
    closeButton.focus();
    fireEvent.click(closeButton);
    act(() => {
      globalThis.dispatchEvent(new Event(OPEN_HEADER_SEARCH_EVENT));
    });

    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(cancelFrame).toHaveBeenCalledWith(42);
    expect(screen.getByText('open')).toBeInTheDocument();
    expect(closeButton).toHaveFocus();

    requestFrame.mockRestore();
    cancelFrame.mockRestore();
  });

  it('keeps global search open while route adapters change', () => {
    const view = render(
      <HeaderActionsProvider>
        <SearchAdapterRegistration adapterKey='releases' />
        <SearchProbe />
      </HeaderActionsProvider>
    );
    act(() => {
      globalThis.dispatchEvent(new Event(OPEN_HEADER_SEARCH_EVENT));
    });
    expect(screen.getByText('open')).toBeInTheDocument();

    view.rerender(
      <HeaderActionsProvider>
        <SearchAdapterRegistration adapterKey='tasks' />
        <SearchProbe />
      </HeaderActionsProvider>
    );

    expect(screen.getByText('open')).toBeInTheDocument();
  });
});
