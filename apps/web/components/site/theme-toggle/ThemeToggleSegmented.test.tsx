import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeToggleSegmented } from './ThemeToggleSegmented';

describe('ThemeToggleSegmented', () => {
  it('exposes labeled theme choices and routes each choice to the owner', () => {
    const setTheme = vi.fn();
    const { getByRole } = render(
      <ThemeToggleSegmented
        currentTheme='light'
        indicatorX={28}
        setTheme={setTheme}
        wrapButton={button => button}
      />
    );

    const toolbar = getByRole('toolbar', { name: 'Theme' });
    expect(toolbar).toBeInTheDocument();
    expect(getByRole('button', { name: 'System Theme' })).toBeInTheDocument();
    expect(getByRole('button', { name: 'Light Theme' })).toBeInTheDocument();
    expect(getByRole('button', { name: 'Dark Theme' })).toBeInTheDocument();

    fireEvent.click(getByRole('button', { name: 'System Theme' }));
    fireEvent.click(getByRole('button', { name: 'Light Theme' }));
    fireEvent.click(getByRole('button', { name: 'Dark Theme' }));

    expect(setTheme.mock.calls).toEqual([['system'], ['light'], ['dark']]);
    expect(toolbar.querySelector('[aria-hidden="true"]')).toHaveStyle(
      'transform: translateX(28px)'
    );
  });

  it('keeps the linear treatment and shortcut description on the same control', () => {
    const wrapButton = vi.fn(button => button);
    const { getByRole, getByText } = render(
      <ThemeToggleSegmented
        currentTheme='dark'
        indicatorX={56}
        setTheme={vi.fn()}
        shortcutDescriptionId='theme-shortcut'
        shortcutDescription='Press T to toggle between light and dark themes.'
        variant='linear'
        wrapButton={wrapButton}
      />
    );

    expect(getByRole('toolbar', { name: 'Theme' })).not.toHaveClass(
      'bg-surface-2'
    );
    expect(
      getByText('Press T to toggle between light and dark themes.')
    ).toHaveClass('sr-only');
    expect(wrapButton).toHaveBeenCalledTimes(2);
  });
});
