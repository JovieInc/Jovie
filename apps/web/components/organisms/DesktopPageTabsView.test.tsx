import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DesktopPageTabsView } from './DesktopPageTabsView';

const state = {
  activeId: 1,
  tabs: [
    { id: 1, title: 'New Chat', loading: false },
    { id: 2, title: 'Library', loading: true },
    { id: 3, title: 'Profiles', loading: false },
  ],
};

describe('Mac page strip', () => {
  it('reserves its slot before the native bridge is ready', () => {
    const { container } = render(
      <DesktopPageTabsView state={null} command={vi.fn()} />
    );
    expect(
      container.querySelector('[data-electron-page-tabs]')
    ).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('exposes independent page commands and loading state without route links', async () => {
    const command = vi.fn(async () => true);
    render(
      <DesktopPageTabsView
        state={state}
        command={command}
        panelId='main-content'
      />
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-busy', 'true');
    expect(tabs[0]).toHaveAttribute('aria-controls', 'main-content');
    fireEvent.click(screen.getByRole('button', { name: 'New Tab' }));
    fireEvent.click(tabs[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Close Profiles tab' }));
    expect(command.mock.calls).toEqual([
      [{ type: 'create' }],
      [{ type: 'select', id: 2 }],
      [{ type: 'close', id: 3 }],
    ]);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('supports arrow wrapping, Home, End and Delete only on tab controls', () => {
    const command = vi.fn(async () => true);
    render(<DesktopPageTabsView state={state} command={command} />);
    const tabs = screen.getAllByRole('tab');
    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' });
    expect(tabs[2]).toHaveFocus();
    fireEvent.keyDown(tabs[2], { key: 'ArrowRight' });
    expect(tabs[0]).toHaveFocus();
    fireEvent.keyDown(tabs[0], { key: 'End' });
    expect(tabs[2]).toHaveFocus();
    fireEvent.keyDown(tabs[2], { key: 'Home' });
    expect(tabs[0]).toHaveFocus();
    fireEvent.keyDown(tabs[0], { key: 'Delete' });
    expect(command).toHaveBeenLastCalledWith({ type: 'close', id: 1 });
    const count = command.mock.calls.length;
    fireEvent.keyDown(screen.getByRole('button', { name: 'New Tab' }), {
      key: 'Delete',
    });
    expect(command).toHaveBeenCalledTimes(count);
  });

  it('keeps controls and announces a retry when native creation fails', async () => {
    const command = vi.fn(async () => false);
    render(<DesktopPageTabsView state={state} command={command} />);
    fireEvent.click(screen.getByRole('button', { name: 'New Tab' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Try again')
    );
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('keeps the strip usable when the native bridge rejects a command', async () => {
    render(
      <DesktopPageTabsView
        state={state}
        command={vi.fn().mockRejectedValue(new Error('native unavailable'))}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'New Tab' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Try again')
    );
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('treats close cancellation as normal and restores focus after accepted removal', async () => {
    const command = vi.fn(async () => false);
    const { rerender } = render(
      <DesktopPageTabsView state={state} command={command} />
    );
    const close = screen.getByRole('button', { name: 'Close New Chat tab' });
    close.focus();
    fireEvent.click(close);
    await waitFor(() => expect(command).toHaveBeenCalled());
    expect(close).toHaveFocus();
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(
      <DesktopPageTabsView
        state={{ activeId: 2, tabs: state.tabs.slice(1) }}
        command={command}
      />
    );
    expect(screen.getByRole('tab', { name: 'Library' })).toHaveFocus();
  });
});
