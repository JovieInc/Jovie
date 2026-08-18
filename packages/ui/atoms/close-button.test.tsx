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
      const icon = document.querySelector('svg');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      expect(icon).toHaveAttribute('data-slot', 'close-icon');
      expect(document.querySelectorAll('svg')).toHaveLength(1);
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
      expect(icon).toHaveAttribute('width', '16');
      expect(icon).toHaveAttribute('height', '16');
      expect(icon).toHaveClass('shrink-0');
    });

    it('supports custom size', () => {
      render(<CloseButtonIcon size={6} />);
      const icon = document.querySelector('svg');
      expect(icon).toHaveAttribute('width', '24');
      expect(icon).toHaveAttribute('height', '24');
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
    expect(closeButtonStyles.hover).toContain('hover:bg-interactive-hover');
    expect(closeButtonStyles.hover).toContain('hover:text-primary-token');
  });

  it('has focus styles', () => {
    expect(closeButtonStyles.focus).toContain('focus-visible:outline-none');
    expect(closeButtonStyles.focus).toContain('focus-visible:ring-2');
    expect(closeButtonStyles.focus).toContain(
      'focus-visible:ring-(--linear-border-focus)'
    );
  });

  it('has disabled styles', () => {
    expect(closeButtonStyles.disabled).toContain(
      'disabled:pointer-events-none'
    );
    expect(closeButtonStyles.disabled).toContain(
      'disabled:opacity-[var(--state-disabled-opacity)]'
    );
  });

  it('has offset styles', () => {
    expect(closeButtonStyles.offset).toContain(
      'ring-offset-(--linear-bg-page)'
    );
  });
});

describe('closeButtonClassName', () => {
  it('combines all style classes', () => {
    expect(closeButtonClassName).toContain('absolute');
    expect(closeButtonClassName).toContain('hover:bg-interactive-hover');
    expect(closeButtonClassName).toContain('focus-visible:ring-2');
    expect(closeButtonClassName).toContain('disabled:pointer-events-none');
    expect(closeButtonClassName).toContain('ring-offset-(--linear-bg-page)');
  });

  it('uses the shared pill close button shape', () => {
    expect(closeButtonClassName).toContain('rounded-full');
    expect(closeButtonClassName).toContain('size-12');
    expect(closeButtonClassName).not.toContain(
      'rounded-(--linear-app-radius-item)'
    );
  });
});
