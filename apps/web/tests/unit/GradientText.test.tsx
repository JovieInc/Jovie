import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GradientText } from '@/components/atoms/GradientText';

describe('GradientText', () => {
  describe('rendering', () => {
    it('renders children text', () => {
      render(<GradientText>Hello World</GradientText>);
      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });

    it('renders as span by default', () => {
      const { container } = render(<GradientText>Text</GradientText>);
      const element = container.querySelector('span');

      expect(element).toBeInTheDocument();
      expect(element).toHaveTextContent('Text');
    });

    it('applies custom className', () => {
      const { container } = render(
        <GradientText className='custom-class'>Text</GradientText>
      );
      const element = container.querySelector('span');

      expect(element).toHaveClass('custom-class');
    });
  });

  describe('variants', () => {
    it('renders primary variant by default', () => {
      const { container } = render(<GradientText>Primary</GradientText>);
      const element = container.querySelector('span');

      expect(element).toHaveClass('from-blue-600');
      expect(element).toHaveClass('via-purple-600');
      expect(element).toHaveClass('to-cyan-600');
    });

    it('renders secondary variant', () => {
      const { container } = render(
        <GradientText variant='secondary'>Secondary</GradientText>
      );
      const element = container.querySelector('span');

      expect(element).toHaveClass('from-gray-600');
      expect(element).toHaveClass('to-gray-800');
    });

    it('renders success variant', () => {
      const { container } = render(
        <GradientText variant='success'>Success</GradientText>
      );
      const element = container.querySelector('span');

      expect(element).toHaveClass('from-green-600');
      expect(element).toHaveClass('to-emerald-600');
    });

    it('renders warning variant', () => {
      const { container } = render(
        <GradientText variant='warning'>Warning</GradientText>
      );
      const element = container.querySelector('span');

      expect(element).toHaveClass('from-yellow-600');
      expect(element).toHaveClass('to-orange-600');
    });

    it('renders purple-cyan variant', () => {
      const { container } = render(
        <GradientText variant='purple-cyan'>Purple Cyan</GradientText>
      );
      const element = container.querySelector('span');

      expect(element).toHaveClass('from-purple-600');
      expect(element).toHaveClass('to-cyan-600');
    });
  });

  describe('as prop', () => {
    it('renders as h1 when specified', () => {
      render(<GradientText as='h1'>Heading</GradientText>);
      const element = screen.getByRole('heading', { level: 1 });

      expect(element).toBeInTheDocument();
      expect(element).toHaveTextContent('Heading');
    });

    it('renders as h2 when specified', () => {
      render(<GradientText as='h2'>Subheading</GradientText>);
      const element = screen.getByRole('heading', { level: 2 });

      expect(element).toBeInTheDocument();
    });

    it('renders as div when specified', () => {
      const { container } = render(
        <GradientText as='div'>Div Text</GradientText>
      );
      const element = container.querySelector('div');

      expect(element).toBeInTheDocument();
      expect(element).toHaveTextContent('Div Text');
    });

    it('renders as p when specified', () => {
      const { container } = render(
        <GradientText as='p'>Paragraph</GradientText>
      );
      const element = container.querySelector('p');

      expect(element).toBeInTheDocument();
    });
  });

  describe('gradient styling', () => {
    it('applies gradient background classes', () => {
      const { container } = render(<GradientText>Text</GradientText>);
      const element = container.querySelector('span');

      expect(element).toHaveClass('bg-gradient-to-r');
      expect(element).toHaveClass('bg-clip-text');
      expect(element).toHaveClass('text-transparent');
    });

    it('includes dark mode variant classes', () => {
      const { container } = render(
        <GradientText variant='primary'>Text</GradientText>
      );
      const element = container.querySelector('span');

      expect(element).toHaveClass('dark:from-blue-400');
      expect(element).toHaveClass('dark:via-purple-400');
      expect(element).toHaveClass('dark:to-cyan-400');
    });
  });

  describe('edge cases', () => {
    it('handles empty children', () => {
      const { container } = render(<GradientText>{''}</GradientText>);
      const element = container.querySelector('span');

      expect(element).toBeInTheDocument();
      expect(element).toHaveTextContent('');
    });

    it('handles complex children with elements', () => {
      render(
        <GradientText>
          Text with <strong>bold</strong> content
        </GradientText>
      );

      expect(screen.getByText(/Text with/)).toBeInTheDocument();
      expect(screen.getByText('bold')).toBeInTheDocument();
    });

    it('combines variant, as, and className', () => {
      render(
        <GradientText variant='success' as='h3' className='text-xl font-bold'>
          Combined
        </GradientText>
      );

      const element = screen.getByRole('heading', { level: 3 });
      expect(element).toHaveClass('from-green-600');
      expect(element).toHaveClass('text-xl');
      expect(element).toHaveClass('font-bold');
    });

    it('renders without errors when all props are provided', () => {
      expect(() => {
        render(
          <GradientText variant='purple-cyan' as='div' className='custom'>
            All Props
          </GradientText>
        );
      }).not.toThrow();
    });
  });
});
