import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from './ThemeToggle';

const themeState = vi.hoisted(() => ({
  theme: 'dark',
  resolvedTheme: 'dark',
  setTheme: vi.fn(),
}));

vi.mock('next-themes', () => ({
  useTheme: () => themeState,
}));

describe('ThemeToggle', () => {
  beforeEach(() => {
    themeState.theme = 'dark';
    themeState.resolvedTheme = 'dark';
    themeState.setTheme.mockReset();
  });

  it('renders an accessible icon control and cycles to the next theme', () => {
    render(<ThemeToggle shortcutKey='t' />);

    const button = screen.getByRole('button', { name: /Toggle theme/ });
    expect(button).toHaveAttribute(
      'title',
      expect.stringContaining('switch to system')
    );
    expect(button).toHaveAttribute('aria-describedby');

    fireEvent.click(button);

    expect(themeState.setTheme).toHaveBeenCalledWith('system');
  });

  it('renders the segmented appearance and routes a selected theme', () => {
    render(<ThemeToggle appearance='segmented' shortcutKey='T' />);

    expect(screen.getByRole('toolbar', { name: 'Theme' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Light Theme' }));

    expect(themeState.setTheme).toHaveBeenCalledWith('light');
    expect(
      screen.getByText('Press T to toggle between light and dark themes.')
    ).toHaveClass('sr-only');
  });

  it('uses the linear token treatment for icon appearance', () => {
    render(<ThemeToggle variant='linear' />);

    expect(screen.getByRole('button', { name: /Toggle theme/ })).toHaveStyle(
      'border: 1px solid var(--linear-border-subtle)'
    );
  });
});
