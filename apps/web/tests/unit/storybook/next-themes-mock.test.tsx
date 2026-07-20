import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeProvider, useTheme } from '../../../.storybook/next-themes-mock';

function ThemeControls() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button type='button' onClick={() => setTheme('light')}>
      {resolvedTheme}
    </button>
  );
}

describe('Storybook next-themes mock', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.style.colorScheme = '';
    globalThis.localStorage.clear();
  });

  it('provides interactive theme state without injecting a script tag', async () => {
    render(
      <ThemeProvider attribute='class' defaultTheme='dark'>
        <ThemeControls />
      </ThemeProvider>
    );

    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByRole('button')).toHaveTextContent('dark');
    await waitFor(() => {
      expect(document.documentElement).toHaveClass('dark');
    });

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('button')).toHaveTextContent('light');
    await waitFor(() => {
      expect(document.documentElement).toHaveClass('light');
      expect(document.documentElement).not.toHaveClass('dark');
    });
    expect(globalThis.localStorage.getItem('theme')).toBe('light');
  });

  it('defaults to light when system themes are disabled', async () => {
    render(
      <ThemeProvider attribute='class' enableSystem={false}>
        <ThemeControls />
      </ThemeProvider>
    );

    expect(screen.getByRole('button')).toHaveTextContent('light');
    await waitFor(() => {
      expect(document.documentElement).toHaveClass('light');
    });
  });
});
