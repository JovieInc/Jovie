import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import { HeaderSearchSurfaceFromContext } from './HeaderSearchSurfaceFromContext';

function renderSurface(calm = false) {
  return render(
    <HeaderActionsProvider>
      <HeaderSearchSurfaceFromContext calm={calm} />
    </HeaderActionsProvider>
  );
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
});
