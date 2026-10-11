import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  HeaderActionsProvider,
  useHeaderActions,
} from '@/contexts/HeaderActionsContext';
import { HeaderSearchSurfaceFromContext } from './HeaderSearchSurfaceFromContext';

function renderSurface(calm = false) {
  return render(
    <HeaderActionsProvider>
      <HeaderSearchSurfaceFromContext calm={calm} />
    </HeaderActionsProvider>
  );
}

function Probe() {
  const { isCommandPaletteOpen } = useHeaderActions();
  return <output>{isCommandPaletteOpen ? 'Open' : 'Closed'}</output>;
}

describe('HeaderSearchSurfaceFromContext', () => {
  it('renders the calm chat-search treatment used by the canonical rail', () => {
    renderSurface(true);

    const trigger = screen.getByRole('button', { name: 'Search Jovie' });

    expect(trigger).toHaveAttribute('data-app-search-trigger', 'true');
    expect(screen.getByText('Search chats')).toBeVisible();
    expect(trigger.className).toContain('h-9');
    expect(trigger.className).toContain('rounded-full');
    expect(trigger.className).toContain('text-(length:--text-app)');
  });

  it('keeps the default compact Search label for the standard rail trigger', () => {
    renderSurface();

    expect(screen.getByText('Search')).toBeVisible();
    expect(screen.queryByText('Search chats')).toBeNull();
  });

  it('opens and closes the existing shared search from the compact icon by keyboard', async () => {
    render(
      <HeaderActionsProvider>
        <div data-app-shell-sidebar-mount='true'>
          <HeaderSearchSurfaceFromContext compact />
          <button type='button'>Other destination</button>
        </div>
        <Probe />
      </HeaderActionsProvider>
    );
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Search Jovie' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('status')).toHaveTextContent('Open');
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('status')).toHaveTextContent('Closed');
    expect(
      screen.queryByText('Search', { exact: true })
    ).not.toBeInTheDocument();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('status')).toHaveTextContent('Open');
    await userEvent.click(
      screen.getByRole('button', { name: 'Other destination' })
    );
    expect(screen.getByRole('status')).toHaveTextContent('Closed');
  });
});
