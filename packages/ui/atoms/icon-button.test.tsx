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
