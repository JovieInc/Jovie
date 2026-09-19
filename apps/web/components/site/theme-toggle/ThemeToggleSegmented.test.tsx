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
    expect(getByRole('button', { name: 'System Theme' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(getByRole('button', { name: 'Light Theme' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(getByRole('button', { name: 'Dark Theme' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );

    fireEvent.click(getByRole('button', { name: 'System Theme' }));
    fireEvent.click(getByRole('button', { name: 'Light Theme' }));
    fireEvent.click(getByRole('button', { name: 'Dark Theme' }));

    expect(setTheme.mock.calls).toEqual([['system'], ['light'], ['dark']]);
    expect(toolbar.querySelector('[aria-hidden="true"]')).toHaveStyle(
      'transform: translateX(28px)'
    );
    expect(
      getByRole('button', { name: 'Dark Theme' }).querySelector(
        'span[aria-hidden="true"]'
      )
    ).toHaveClass('inset-[calc(-3/16*1rem)]');
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

  it('keeps footer hit targets disjoint while the visible control stays 28px', () => {
    const { getByRole } = render(
      <ThemeToggleSegmented
        currentTheme='dark'
        indicatorX={88}
        setTheme={vi.fn()}
        size='footer'
        wrapButton={button => button}
      />
    );

    const toolbar = getByRole('toolbar', { name: 'Theme' });
    expect(toolbar).toHaveClass('h-11', 'px-0', 'py-2');
    expect(getByRole('button', { name: 'Dark Theme' })).toHaveClass(
      'h-7',
      'w-11',
      'px-3'
    );
    expect(toolbar.querySelector('[aria-hidden="true"]')).toHaveStyle(
      'transform: translateX(88px)'
    );
    expect(toolbar.querySelector('[aria-hidden="true"]')).toHaveClass(
      'top-2',
      'bottom-2',
      'left-2',
      'w-7'
    );
    expect(
      getByRole('button', { name: 'Dark Theme' }).querySelector(
        'span[aria-hidden="true"]'
      )
    ).toHaveClass('-inset-y-2', 'left-0', 'right-0');
  });
});
