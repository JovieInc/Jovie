import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  CloseButtonIcon,
  closeButtonClassName,
  closeButtonStyles,
} from './close-button';

describe('CloseButtonIcon', () => {
  describe('Basic Rendering', () => {
    it('renders X icon', () => {
      render(<CloseButtonIcon />);
      // The icon is rendered with aria-hidden
      const icon = document.querySelector('svg');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });

    it('renders screen reader text', () => {
      render(<CloseButtonIcon />);
      expect(screen.getByText('Close')).toBeInTheDocument();
    });

    it('screen reader text has sr-only class', () => {
      render(<CloseButtonIcon />);
      const srText = screen.getByText('Close');
      expect(srText.className).toContain('sr-only');
    });

    it('has correct displayName', () => {
      expect(CloseButtonIcon.displayName).toBe('CloseButtonIcon');
    });
  });

  describe('Size', () => {
    it('uses default size of 4', () => {
      render(<CloseButtonIcon />);
      const icon = document.querySelector('svg');
      // Check that the icon has size classes applied (includes h-4 w-4)
      expect(icon?.getAttribute('class')).toContain('h-4');
      expect(icon?.getAttribute('class')).toContain('w-4');
    });

    it('supports custom size', () => {
      render(<CloseButtonIcon size={6} />);
      const icon = document.querySelector('svg');
      // Check that the icon has size classes applied (includes h-6 w-6)
      expect(icon?.getAttribute('class')).toContain('h-6');
      expect(icon?.getAttribute('class')).toContain('w-6');
    });
  });

  describe('Styling', () => {
    it('merges custom className', () => {
      render(<CloseButtonIcon className='custom-icon-class' />);
      const icon = document.querySelector('svg');
      expect(icon?.getAttribute('class')).toContain('custom-icon-class');
    });
  });
});

describe('closeButtonStyles', () => {
  it('has base styles', () => {
    expect(closeButtonStyles.base).toContain('absolute');
    expect(closeButtonStyles.base).toContain('right-4');
    expect(closeButtonStyles.base).toContain('top-4');
  });

  it('has hover styles', () => {
    expect(closeButtonStyles.hover).toContain('hover:opacity-100');
  });

  it('has focus styles', () => {
    expect(closeButtonStyles.focus).toContain('focus-visible:outline-none');
    expect(closeButtonStyles.focus).toContain('focus-visible:ring-2');
  });

  it('has disabled styles', () => {
    expect(closeButtonStyles.disabled).toContain(
      'disabled:pointer-events-none'
    );
  });

  it('has offset styles', () => {
    expect(closeButtonStyles.offset).toContain('ring-offset-surface-1');
  });
});

describe('closeButtonClassName', () => {
  it('combines all style classes', () => {
    expect(closeButtonClassName).toContain('absolute');
    expect(closeButtonClassName).toContain('hover:opacity-100');
    expect(closeButtonClassName).toContain('focus-visible:ring-2');
    expect(closeButtonClassName).toContain('disabled:pointer-events-none');
    expect(closeButtonClassName).toContain('ring-offset-surface-1');
  });
});
