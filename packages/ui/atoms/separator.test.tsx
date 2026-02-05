import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';

import { Separator } from './separator';

describe('Separator', () => {
  describe('Basic Rendering', () => {
    it('renders with separator role by default when decorative is false', () => {
      render(<Separator decorative={false} />);
      expect(screen.getByRole('separator')).toBeInTheDocument();
    });

    it('is decorative by default (no role)', () => {
      render(<Separator data-testid='separator' />);
      const separator = screen.getByTestId('separator');
      expect(separator).toBeInTheDocument();
      // Decorative separators have role="none"
      expect(separator).toHaveAttribute('role', 'none');
    });

    it('forwards refs correctly', () => {
      const ref = React.createRef<HTMLDivElement>();
      render(<Separator ref={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe('Orientation', () => {
    it('renders horizontal by default', () => {
      render(<Separator data-testid='separator' />);
      const separator = screen.getByTestId('separator');
      expect(separator.className).toContain('h-[1px]');
      expect(separator.className).toContain('w-full');
    });

    it('renders vertical orientation', () => {
      render(<Separator orientation='vertical' data-testid='separator' />);
      const separator = screen.getByTestId('separator');
      expect(separator.className).toContain('h-full');
      expect(separator.className).toContain('w-[1px]');
    });

    it('sets aria-orientation when not decorative', () => {
      render(
        <Separator
          orientation='vertical'
          decorative={false}
          data-testid='separator'
        />
      );
      const separator = screen.getByRole('separator');
      expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    });
  });

  describe('Decorative', () => {
    it('is decorative by default', () => {
      render(<Separator data-testid='separator' />);
      const separator = screen.getByTestId('separator');
      expect(separator).toHaveAttribute('data-orientation', 'horizontal');
    });

    it('supports non-decorative separator', () => {
      render(<Separator decorative={false} />);
      const separator = screen.getByRole('separator');
      expect(separator).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('applies base styling classes', () => {
      render(<Separator data-testid='separator' />);
      const separator = screen.getByTestId('separator');
      expect(separator.className).toContain('shrink-0');
      expect(separator.className).toContain('bg-border');
    });

    it('merges custom className', () => {
      render(<Separator className='my-4' data-testid='separator' />);
      const separator = screen.getByTestId('separator');
      expect(separator.className).toContain('my-4');
      expect(separator.className).toContain('bg-border');
    });
  });

  describe('HTML Attributes', () => {
    it('passes through HTML attributes', () => {
      render(<Separator id='custom-id' data-testid='separator' />);
      const separator = screen.getByTestId('separator');
      expect(separator).toHaveAttribute('id', 'custom-id');
    });

    it('supports data-orientation attribute', () => {
      render(<Separator orientation='vertical' data-testid='separator' />);
      const separator = screen.getByTestId('separator');
      expect(separator).toHaveAttribute('data-orientation', 'vertical');
    });
  });

  describe('Usage Examples', () => {
    it('works as horizontal divider between elements', () => {
      render(
        <div>
          <p>Section 1</p>
          <Separator data-testid='separator' />
          <p>Section 2</p>
        </div>
      );
      expect(screen.getByText('Section 1')).toBeInTheDocument();
      expect(screen.getByTestId('separator')).toBeInTheDocument();
      expect(screen.getByText('Section 2')).toBeInTheDocument();
    });

    it('works as vertical divider between elements', () => {
      render(
        <div className='flex'>
          <span>Left</span>
          <Separator orientation='vertical' data-testid='separator' />
          <span>Right</span>
        </div>
      );
      expect(screen.getByText('Left')).toBeInTheDocument();
      expect(screen.getByTestId('separator')).toBeInTheDocument();
      expect(screen.getByText('Right')).toBeInTheDocument();
    });
  });
});
