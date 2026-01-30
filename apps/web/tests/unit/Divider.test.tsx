import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Divider } from '@/components/atoms/Divider';

describe('Divider', () => {
  describe('rendering', () => {
    it('renders with default horizontal orientation', () => {
      const { container } = render(<Divider />);
      const divider = container.querySelector('[role="separator"]');

      expect(divider).toBeInTheDocument();
      expect(divider).toHaveAttribute('aria-orientation', 'horizontal');
    });

    it('renders with vertical orientation', () => {
      const { container } = render(<Divider orientation='vertical' />);
      const divider = container.querySelector('[role="separator"]');

      expect(divider).toHaveAttribute('aria-orientation', 'vertical');
    });

    it('applies custom className', () => {
      const { container } = render(<Divider className='custom-class' />);
      const divider = container.querySelector('[role="separator"]');

      expect(divider).toHaveClass('custom-class');
    });
  });

  describe('accessibility', () => {
    it('has separator role by default', () => {
      const { container } = render(<Divider />);
      const divider = container.querySelector('[role="separator"]');

      expect(divider).toBeInTheDocument();
    });

    it('removes role when ariaHidden is true', () => {
      const { container } = render(<Divider ariaHidden />);
      const divider = container.querySelector('div');

      expect(divider).not.toHaveAttribute('role');
      expect(divider).toHaveAttribute('aria-hidden', 'true');
    });

    it('includes aria-orientation when not hidden', () => {
      const { container } = render(<Divider orientation='vertical' />);
      const divider = container.querySelector('[role="separator"]');

      expect(divider).toHaveAttribute('aria-orientation', 'vertical');
    });

    it('removes aria-orientation when hidden', () => {
      const { container } = render(
        <Divider ariaHidden orientation='vertical' />
      );
      const divider = container.querySelector('div');

      expect(divider).not.toHaveAttribute('aria-orientation');
    });
  });

  describe('inset', () => {
    it('applies inset margin when inset is true', () => {
      const { container } = render(<Divider inset />);
      const divider = container.querySelector('[role="separator"]');

      expect(divider).toHaveClass('mx-3');
    });

    it('does not apply inset margin by default', () => {
      const { container } = render(<Divider />);
      const divider = container.querySelector('[role="separator"]');

      expect(divider).not.toHaveClass('mx-3');
    });
  });

  describe('styling', () => {
    it('applies horizontal border for horizontal orientation', () => {
      const { container } = render(<Divider orientation='horizontal' />);
      const divider = container.querySelector('[role="separator"]');

      expect(divider).toHaveClass('border-t');
      expect(divider).not.toHaveClass('border-l');
    });

    it('applies vertical border for vertical orientation', () => {
      const { container } = render(<Divider orientation='vertical' />);
      const divider = container.querySelector('[role="separator"]');

      expect(divider).toHaveClass('border-l');
      expect(divider).not.toHaveClass('border-t');
    });

    it('applies border-subtle class', () => {
      const { container } = render(<Divider />);
      const divider = container.querySelector('[role="separator"]');

      expect(divider).toHaveClass('border-subtle');
    });

    it('sets correct dimensions for horizontal divider', () => {
      const { container } = render(<Divider orientation='horizontal' />);
      const divider = container.querySelector(
        '[role="separator"]'
      ) as HTMLElement;

      expect(divider.style.width).toBe('100%');
      expect(divider.style.height).toBe('1px');
    });

    it('sets correct dimensions for vertical divider', () => {
      const { container } = render(<Divider orientation='vertical' />);
      const divider = container.querySelector(
        '[role="separator"]'
      ) as HTMLElement;

      expect(divider.style.width).toBe('1px');
      expect(divider.style.height).toBe('100%');
    });
  });

  describe('edge cases', () => {
    it('handles both inset and custom className', () => {
      const { container } = render(<Divider inset className='custom' />);
      const divider = container.querySelector('[role="separator"]');

      expect(divider).toHaveClass('mx-3');
      expect(divider).toHaveClass('custom');
    });

    it('renders without errors when all props are provided', () => {
      expect(() => {
        render(
          <Divider
            orientation='vertical'
            inset
            ariaHidden
            className='test-class'
          />
        );
      }).not.toThrow();
    });
  });
});
