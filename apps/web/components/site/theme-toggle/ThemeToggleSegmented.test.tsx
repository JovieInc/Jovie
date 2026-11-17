import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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
    for (const name of ['System Theme', 'Light Theme', 'Dark Theme']) {
      expect(getByRole('button', { name })).toHaveAttribute(
        'data-slot',
        'plain-button'
      );
    }
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

// State and accessibility coverage for each treatment of the rail.
describe('ThemeToggleSegmented states', () => {
  it.each([
    ['default', 'default'],
    ['default', 'footer'],
    ['linear', 'default'],
  ] as const)(
    'has no axe violations in the %s variant at the %s size',
    async (variant, size) => {
      const { container } = render(
        <ThemeToggleSegmented
          currentTheme='system'
          indicatorX={0}
          setTheme={vi.fn()}
          shortcutDescriptionId='theme-shortcut'
          shortcutDescription='Press T to toggle between light and dark themes.'
          variant={variant}
          size={size}
          wrapButton={button => button}
        />
      );

      expect(
        screen.getByRole('button', { name: 'Light Theme' })
      ).toHaveAttribute('aria-describedby', 'theme-shortcut');
      await expectNoA11yViolations(container);
    }
  );

  it('leaves the buttons undescribed without a shortcut hint', async () => {
    const { container } = render(
      <ThemeToggleSegmented
        currentTheme='light'
        indicatorX={28}
        setTheme={vi.fn()}
        wrapButton={button => button}
      />
    );

    for (const name of ['System Theme', 'Light Theme', 'Dark Theme']) {
      const button = screen.getByRole('button', { name });
      expect(button).not.toHaveAttribute('aria-describedby');
      expect(button).toHaveAttribute('type', 'button');
    }
    expect(container.querySelector('.sr-only')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('moves through the themes from the keyboard and keeps focus on the pressed button', async () => {
    const user = userEvent.setup();
    const setTheme = vi.fn();
    const { rerender } = render(
      <ThemeToggleSegmented
        currentTheme='system'
        indicatorX={0}
        setTheme={setTheme}
        wrapButton={button => button}
      />
    );

    await user.tab();
    expect(screen.getByRole('button', { name: 'System Theme' })).toHaveFocus();
    await user.tab();
    const light = screen.getByRole('button', { name: 'Light Theme' });
    expect(light).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(setTheme).toHaveBeenLastCalledWith('light');

    rerender(
      <ThemeToggleSegmented
        currentTheme='light'
        indicatorX={28}
        setTheme={setTheme}
        wrapButton={button => button}
      />
    );
    expect(light).toHaveFocus();
    expect(light).toHaveAttribute('aria-pressed', 'true');
    await user.tab();
    await user.keyboard(' ');
    expect(setTheme).toHaveBeenLastCalledWith('dark');
  });

  it('has no axe violations in a right-to-left page', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ThemeToggleSegmented
          currentTheme='dark'
          indicatorX={88}
          setTheme={vi.fn()}
          size='footer'
          wrapButton={button => button}
        />
      </div>
    );

    expect(screen.getByRole('toolbar', { name: 'Theme' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
