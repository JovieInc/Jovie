import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketingFooterControls } from './MarketingFooterControls';

const themeState = vi.hoisted(() => ({
  theme: 'dark',
  resolvedTheme: 'dark',
  setTheme: vi.fn(),
}));

vi.mock('next-themes', () => ({
  useTheme: () => themeState,
}));

describe('MarketingFooterControls', () => {
  beforeEach(() => {
    themeState.theme = 'dark';
    themeState.resolvedTheme = 'dark';
    themeState.setTheme.mockReset();
  });

  it('routes all three theme choices through the persisted theme owner', async () => {
    render(<MarketingFooterControls />);

    await waitFor(() =>
      expect(screen.getByRole('toolbar', { name: 'Theme' })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('button', { name: 'System Theme' }));
    fireEvent.click(screen.getByRole('button', { name: 'Light Theme' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dark Theme' }));

    expect(themeState.setTheme.mock.calls).toEqual([
      ['system'],
      ['light'],
      ['dark'],
    ]);
  });

  it('shows the single supported locale without a dead-end menu', () => {
    render(<MarketingFooterControls />);

    expect(screen.getByTestId('marketing-locale-static')).toHaveTextContent(
      'English'
    );
    expect(screen.getByTestId('marketing-locale-static')).toHaveAttribute(
      'title',
      'Language: English'
    );
    expect(screen.queryByRole('button', { name: /Language/ })).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('omits marketing preferences when the route is outside the declared policy', () => {
    render(<MarketingFooterControls enabled={false} />);

    expect(screen.queryByTestId('marketing-footer-controls')).toBeNull();
  });
});
