import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { IconButton } from './icon-button';
import {
  ICON_BUTTON_SIZE_NAMES,
  ICON_BUTTON_VARIANT_NAMES,
} from './icon-button-contract';

describe('IconButton', () => {
  it('renders an accessible icon-only button from the canonical contract', () => {
    render(
      <IconButton ariaLabel='Open menu'>
        <svg aria-hidden='true' />
      </IconButton>
    );

    const button = screen.getByRole('button', { name: 'Open menu' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('type', 'button');
  });

  it('defaults to the ghost lg contract', () => {
    render(
      <IconButton ariaLabel='Default'>
        <svg aria-hidden='true' />
      </IconButton>
    );

    const button = screen.getByRole('button', { name: 'Default' });
    expect(button).toHaveAttribute('data-size', 'icon-lg');
    expect(button.className).toContain('h-10');
    expect(button.className).toContain('w-10');
  });

  it('maps every contract size onto a base Button icon size', () => {
    const expectedButtonSize: Record<string, string> = {
      xs: 'icon-xs',
      sm: 'icon-sm',
      md: 'icon-md',
      lg: 'icon-lg',
      xl: 'icon-xl',
    };

    for (const size of ICON_BUTTON_SIZE_NAMES) {
      const { unmount } = render(
        <IconButton ariaLabel={`Size ${size}`} size={size}>
          <svg aria-hidden='true' />
        </IconButton>
      );
      const button = screen.getByRole('button', { name: `Size ${size}` });
      expect(button).toHaveAttribute('data-size', expectedButtonSize[size]);
      unmount();
    }
  });

  it('keeps the 44px hit target pseudo-element below the xl size', () => {
    for (const size of ICON_BUTTON_SIZE_NAMES) {
      const { unmount } = render(
        <IconButton ariaLabel={`Hit ${size}`} size={size}>
          <svg aria-hidden='true' />
        </IconButton>
      );
      const button = screen.getByRole('button', { name: `Hit ${size}` });
      if (size === 'xl') {
        // 44px container satisfies the hit target by construction.
        expect(button.className).toContain('h-11');
      } else {
        expect(button.className).toContain('before:h-11');
        expect(button.className).toContain('before:w-11');
      }
      unmount();
    }
  });

  it('keeps secondary controls unfilled at rest with circular interaction states', () => {
    render(
      <IconButton ariaLabel='Secondary action' size='md' variant='secondary'>
        <svg aria-hidden='true' />
      </IconButton>
    );

    const button = screen.getByRole('button', { name: 'Secondary action' });
    expect(button).toHaveAttribute('data-variant', 'ghost');
    expect(button.className).toContain('rounded-full');
    expect(button.className).toContain('border-transparent');
    expect(button.className).toContain('bg-transparent');
    expect(button.className).toContain('overflow-visible');
    expect(button.className).toContain('shadow-none');
    expect(button.className).toContain('hover:bg-interactive-hover');
    expect(button.className).toContain('focus-visible:bg-interactive-hover');
    expect(button.className).toContain('active:bg-interactive-active');
    expect(button.className).not.toContain('bg-surface-2');
    expect(button.className).not.toContain('shadow-sm');
    expect(button.className).toContain('before:h-11');
    expect(button.className).toContain('before:w-11');
  });

  it('preserves secondary geometry and state semantics when disabled or loading', () => {
    const { rerender } = render(
      <IconButton
        ariaLabel='Secondary state'
        disabled
        size='md'
        variant='secondary'
      >
        <svg aria-hidden='true' />
      </IconButton>
    );

    const disabledButton = screen.getByRole('button', {
      name: 'Secondary state',
    });
    expect(disabledButton).toBeDisabled();
    expect(disabledButton).toHaveAttribute('data-state', 'disabled');
    expect(disabledButton).toHaveAttribute('aria-disabled', 'true');
    expect(disabledButton.className).toContain(
      'disabled:opacity-[var(--state-disabled-opacity)]'
    );
    expect(disabledButton.className).toContain('h-8');
    expect(disabledButton.className).toContain('w-8');
    expect(disabledButton.className).toContain('before:h-11');
    expect(disabledButton.className).toContain('before:w-11');

    rerender(
      <IconButton
        ariaLabel='Secondary state'
        loading
        size='md'
        variant='secondary'
      >
        <svg aria-hidden='true' data-testid='secondary-glyph' />
      </IconButton>
    );

    const loadingButton = screen.getByRole('button', {
      name: 'Secondary state',
    });
    expect(loadingButton).toBeDisabled();
    expect(loadingButton).toHaveAttribute('data-state', 'loading');
    expect(loadingButton).toHaveAttribute('aria-busy', 'true');
    expect(loadingButton.className).toContain('h-8');
    expect(loadingButton.className).toContain('w-8');
    expect(loadingButton.className).toContain('before:h-11');
    expect(loadingButton.className).toContain('before:w-11');
    expect(screen.getByTestId('secondary-glyph').parentElement).toHaveClass(
      'opacity-0'
    );
    expect(screen.getByLabelText('Loading').parentElement).toHaveClass(
      'absolute'
    );
  });

  it('shares one focus ring and reduced-motion policy across all variants', () => {
    for (const variant of ICON_BUTTON_VARIANT_NAMES) {
      const { unmount } = render(
        <IconButton ariaLabel={`${variant} action`} variant={variant}>
          <svg aria-hidden='true' />
        </IconButton>
      );
      const button = screen.getByRole('button', {
        name: `${variant} action`,
      });
      expect(button.className).toContain(
        'focus-visible:ring-(--linear-border-focus)/55'
      );
      expect(button.className).toContain('motion-reduce:transition-none');
      expect(button.className).not.toContain('focus-visible:ring-ring');
      expect(button.className).not.toContain('focus-visible:ring-focus/16');
      unmount();
    }
  });

  it('accepts aria-label as an alternative to ariaLabel', () => {
    render(
      <IconButton aria-label='Close'>
        <svg aria-hidden='true' />
      </IconButton>
    );
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});
