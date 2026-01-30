import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlaceholderImage } from '@/components/atoms/PlaceholderImage';

describe('PlaceholderImage', () => {
  describe('rendering', () => {
    it('renders placeholder image', () => {
      const { container } = render(<PlaceholderImage />);
      const placeholder = container.querySelector('div');

      expect(placeholder).toBeInTheDocument();
    });

    it('renders default SVG icon', () => {
      const { container } = render(<PlaceholderImage />);
      const svg = container.querySelector('svg');

      expect(svg).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(
        <PlaceholderImage className='custom-class' />
      );
      const placeholder = container.querySelector('div');

      expect(placeholder).toHaveClass('custom-class');
    });

    it('renders custom children', () => {
      render(
        <PlaceholderImage>
          <span data-testid='custom-child'>Custom</span>
        </PlaceholderImage>
      );

      expect(screen.getByTestId('custom-child')).toBeInTheDocument();
      expect(screen.getByText('Custom')).toBeInTheDocument();
    });

    it('does not render default SVG when children provided', () => {
      const { container } = render(
        <PlaceholderImage>
          <span>Custom</span>
        </PlaceholderImage>
      );
      const svg = container.querySelector('svg');

      expect(svg).not.toBeInTheDocument();
    });
  });

  describe('sizes', () => {
    it('uses medium size by default', () => {
      const { container } = render(<PlaceholderImage />);
      const placeholder = container.querySelector('div');

      expect(placeholder).toHaveClass('h-12');
      expect(placeholder).toHaveClass('w-12');
    });

    it('renders small size', () => {
      const { container } = render(<PlaceholderImage size='sm' />);
      const placeholder = container.querySelector('div');

      expect(placeholder).toHaveClass('h-8');
      expect(placeholder).toHaveClass('w-8');
    });

    it('renders medium size explicitly', () => {
      const { container } = render(<PlaceholderImage size='md' />);
      const placeholder = container.querySelector('div');

      expect(placeholder).toHaveClass('h-12');
      expect(placeholder).toHaveClass('w-12');
    });

    it('renders large size', () => {
      const { container } = render(<PlaceholderImage size='lg' />);
      const placeholder = container.querySelector('div');

      expect(placeholder).toHaveClass('h-16');
      expect(placeholder).toHaveClass('w-16');
    });

    it('renders extra large size', () => {
      const { container } = render(<PlaceholderImage size='xl' />);
      const placeholder = container.querySelector('div');

      expect(placeholder).toHaveClass('h-24');
      expect(placeholder).toHaveClass('w-24');
    });

    it('renders 2xl size', () => {
      const { container } = render(<PlaceholderImage size='2xl' />);
      const placeholder = container.querySelector('div');

      expect(placeholder).toHaveClass('h-32');
      expect(placeholder).toHaveClass('w-32');
    });
  });

  describe('shapes', () => {
    it('uses circle shape by default', () => {
      const { container } = render(<PlaceholderImage />);
      const placeholder = container.querySelector('div');

      expect(placeholder).toHaveClass('rounded-full');
    });

    it('renders circle shape explicitly', () => {
      const { container } = render(<PlaceholderImage shape='circle' />);
      const placeholder = container.querySelector('div');

      expect(placeholder).toHaveClass('rounded-full');
    });

    it('renders square shape', () => {
      const { container } = render(<PlaceholderImage shape='square' />);
      const placeholder = container.querySelector('div');

      expect(placeholder).toHaveClass('rounded-none');
    });

    it('renders rounded shape', () => {
      const { container } = render(<PlaceholderImage shape='rounded' />);
      const placeholder = container.querySelector('div');

      expect(placeholder).toHaveClass('rounded-lg');
    });
  });

  describe('styling', () => {
    it('applies base gradient classes', () => {
      const { container } = render(<PlaceholderImage />);
      const placeholder = container.querySelector('div');

      expect(placeholder?.className).toContain('bg-gradient-to-br');
      expect(placeholder?.className).toContain('from-gray-200');
      expect(placeholder?.className).toContain('to-gray-300');
    });

    it('applies dark mode gradient classes', () => {
      const { container } = render(<PlaceholderImage />);
      const placeholder = container.querySelector('div');

      expect(placeholder?.className).toContain('dark:from-gray-700');
      expect(placeholder?.className).toContain('dark:to-gray-800');
    });

    it('centers content', () => {
      const { container } = render(<PlaceholderImage />);
      const placeholder = container.querySelector('div');

      expect(placeholder).toHaveClass('flex');
      expect(placeholder).toHaveClass('items-center');
      expect(placeholder).toHaveClass('justify-center');
    });

    it('applies correct SVG sizing', () => {
      const { container } = render(<PlaceholderImage />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveClass('h-1/2');
      expect(svg).toHaveClass('w-1/2');
    });

    it('applies SVG text color', () => {
      const { container } = render(<PlaceholderImage />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveClass('text-gray-400');
      expect(svg).toHaveClass('dark:text-gray-500');
    });

    it('SVG has fill attribute', () => {
      const { container } = render(<PlaceholderImage />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('fill', 'currentColor');
    });

    it('SVG has viewBox attribute', () => {
      const { container } = render(<PlaceholderImage />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    });
  });

  describe('accessibility', () => {
    it('SVG has role attribute', () => {
      const { container } = render(<PlaceholderImage />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('role', 'img');
    });

    it('SVG has aria-label', () => {
      const { container } = render(<PlaceholderImage />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('aria-label', 'Default profile picture');
    });

    it('custom children do not have forced accessibility attributes', () => {
      render(
        <PlaceholderImage>
          <img src='/test.jpg' alt='Test' />
        </PlaceholderImage>
      );

      const img = screen.getByAltText('Test');
      expect(img).toBeInTheDocument();
    });
  });

  describe('ref forwarding', () => {
    it('forwards ref to div element', () => {
      const ref = { current: null as HTMLDivElement | null };
      render(<PlaceholderImage ref={ref} />);

      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });

    it('allows ref to access element properties', () => {
      const ref = { current: null as HTMLDivElement | null };
      render(<PlaceholderImage ref={ref} size='lg' />);

      expect(ref.current?.className).toContain('h-16');
      expect(ref.current?.className).toContain('w-16');
    });
  });

  describe('edge cases', () => {
    it('combines size, shape, and className', () => {
      const { container } = render(
        <PlaceholderImage
          size='xl'
          shape='rounded'
          className='border-2 border-blue-500'
        />
      );
      const placeholder = container.querySelector('div');

      expect(placeholder).toHaveClass('h-24', 'w-24');
      expect(placeholder).toHaveClass('rounded-lg');
      expect(placeholder).toHaveClass('border-2', 'border-blue-500');
    });

    it('renders with empty children', () => {
      const { container } = render(<PlaceholderImage>{null}</PlaceholderImage>);
      const svg = container.querySelector('svg');

      // null children should render default SVG
      expect(svg).toBeInTheDocument();
    });

    it('renders with undefined children', () => {
      const { container } = render(
        <PlaceholderImage>{undefined}</PlaceholderImage>
      );
      const svg = container.querySelector('svg');

      // undefined children should render default SVG
      expect(svg).toBeInTheDocument();
    });

    it('renders with text children', () => {
      render(<PlaceholderImage>AB</PlaceholderImage>);

      expect(screen.getByText('AB')).toBeInTheDocument();
    });

    it('renders with complex children', () => {
      render(
        <PlaceholderImage>
          <div>
            <span>Line 1</span>
            <span>Line 2</span>
          </div>
        </PlaceholderImage>
      );

      expect(screen.getByText('Line 1')).toBeInTheDocument();
      expect(screen.getByText('Line 2')).toBeInTheDocument();
    });
  });

  describe('displayName', () => {
    it('has correct displayName', () => {
      expect(PlaceholderImage.displayName).toBe('PlaceholderImage');
    });
  });

  describe('SVG path', () => {
    it('renders user profile icon path', () => {
      const { container } = render(<PlaceholderImage />);
      const path = container.querySelector('path');

      expect(path).toBeInTheDocument();
      expect(path).toHaveAttribute(
        'd',
        'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'
      );
    });
  });
});
