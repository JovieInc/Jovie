import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeToggleIcon } from './ThemeToggleIcon';

vi.mock('./ThemeIcons', () => ({
  MoonIcon: () => <span data-testid='moon-icon' />,
  SunIcon: () => <span data-testid='sun-icon' />,
  SystemIcon: () => <span data-testid='system-icon' />,
}));

describe('ThemeToggleIcon', () => {
  it('uses the system icon while the system preference is selected', () => {
    const { getByTestId, queryByTestId } = render(
      <ThemeToggleIcon theme='system' resolvedTheme='dark' />
    );

    expect(getByTestId('system-icon')).toBeInTheDocument();
    expect(queryByTestId('sun-icon')).not.toBeInTheDocument();
    expect(queryByTestId('moon-icon')).not.toBeInTheDocument();
  });

  it('uses the moon icon for an explicitly light theme', () => {
    const { getByTestId, queryByTestId } = render(
      <ThemeToggleIcon theme='light' resolvedTheme='light' />
    );

    expect(getByTestId('moon-icon')).toBeInTheDocument();
    expect(queryByTestId('sun-icon')).not.toBeInTheDocument();
  });

  it.each([
    ['dark', 'dark'],
    [undefined, undefined],
  ] as const)('uses the sun icon for the %s fallback branch', (theme, resolvedTheme) => {
    const { getByTestId } = render(
      <ThemeToggleIcon theme={theme} resolvedTheme={resolvedTheme} />
    );

    expect(getByTestId('sun-icon')).toBeInTheDocument();
  });
});
