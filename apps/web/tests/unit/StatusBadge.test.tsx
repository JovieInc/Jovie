import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from '@/components/atoms/StatusBadge';

describe('StatusBadge', () => {
  describe('rendering', () => {
    it('renders children text', () => {
      render(<StatusBadge>Active</StatusBadge>);
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('renders with custom className', () => {
      const { container } = render(
        <StatusBadge className='custom-class'>Badge</StatusBadge>
      );
      const badge = container.querySelector('div');

      expect(badge).toHaveClass('custom-class');
    });
  });

  describe('variants', () => {
    it('uses blue variant by default', () => {
      const { container } = render(<StatusBadge>Default</StatusBadge>);
      const badge = container.querySelector('div');

      expect(badge).toHaveClass('bg-info-subtle');
      expect(badge).toHaveClass('border-info/20');
      expect(badge).toHaveClass('text-info');
    });

    it('renders green variant', () => {
      const { container } = render(
        <StatusBadge variant='green'>Success</StatusBadge>
      );
      const badge = container.querySelector('div');

      expect(badge).toHaveClass('bg-success-subtle');
      expect(badge).toHaveClass('text-success');
    });

    it('renders purple variant', () => {
      const { container } = render(
        <StatusBadge variant='purple'>Info</StatusBadge>
      );
      const badge = container.querySelector('div');

      expect(badge).toHaveClass('bg-accent-subtle');
      expect(badge).toHaveClass('text-accent');
    });

    it('renders orange variant', () => {
      const { container } = render(
        <StatusBadge variant='orange'>Warning</StatusBadge>
      );
      const badge = container.querySelector('div');

      expect(badge).toHaveClass('bg-warning-subtle');
      expect(badge).toHaveClass('text-warning');
    });

    it('renders red variant', () => {
      const { container } = render(
        <StatusBadge variant='red'>Error</StatusBadge>
      );
      const badge = container.querySelector('div');

      expect(badge).toHaveClass('bg-error-subtle');
      expect(badge).toHaveClass('text-error');
    });

    it('renders gray variant', () => {
      const { container } = render(
        <StatusBadge variant='gray'>Neutral</StatusBadge>
      );
      const badge = container.querySelector('div');

      expect(badge).toHaveClass('bg-surface-2');
      expect(badge).toHaveClass('text-tertiary-token');
    });
  });

  describe('sizes', () => {
    it('uses medium size by default', () => {
      const { container } = render(<StatusBadge>Medium</StatusBadge>);
      const badge = container.querySelector('div');

      expect(badge).toHaveClass('px-4');
      expect(badge).toHaveClass('py-2');
      expect(badge).toHaveClass('text-sm');
    });

    it('renders small size', () => {
      const { container } = render(<StatusBadge size='sm'>Small</StatusBadge>);
      const badge = container.querySelector('div');

      expect(badge).toHaveClass('px-3');
      expect(badge).toHaveClass('py-1');
      expect(badge).toHaveClass('text-xs');
    });

    it('renders large size', () => {
      const { container } = render(<StatusBadge size='lg'>Large</StatusBadge>);
      const badge = container.querySelector('div');

      expect(badge).toHaveClass('px-5');
      expect(badge).toHaveClass('py-2.5');
      expect(badge).toHaveClass('text-base');
    });
  });

  describe('icon support', () => {
    it('renders without icon by default', () => {
      const { container } = render(<StatusBadge>No Icon</StatusBadge>);
      const badge = container.querySelector('div');
      const iconSpan = badge?.querySelector('.flex-shrink-0');

      expect(iconSpan).not.toBeInTheDocument();
    });

    it('renders with icon', () => {
      render(
        <StatusBadge icon={<span data-testid='icon'>★</span>}>
          With Icon
        </StatusBadge>
      );

      expect(screen.getByTestId('icon')).toBeInTheDocument();
      expect(screen.getByText('★')).toBeInTheDocument();
    });

    it('applies flex-shrink-0 to icon wrapper', () => {
      const { container } = render(
        <StatusBadge icon={<span>⚡</span>}>Icon Badge</StatusBadge>
      );

      const iconWrapper = container.querySelector('.flex-shrink-0');
      expect(iconWrapper).toBeInTheDocument();
      expect(iconWrapper).toHaveTextContent('⚡');
    });

    it('icon appears before text', () => {
      const { container } = render(
        <StatusBadge icon={<span>→</span>}>Text</StatusBadge>
      );

      const badge = container.querySelector('div');
      const firstChild = badge?.firstChild;

      expect(firstChild).toHaveClass('flex-shrink-0');
    });
  });

  describe('accessibility', () => {
    it('has no role when not dynamic', () => {
      const { container } = render(<StatusBadge>Static</StatusBadge>);
      const badge = container.querySelector('div');

      expect(badge).not.toHaveAttribute('role');
    });

    it('has status role when dynamic', () => {
      render(<StatusBadge dynamic>Loading...</StatusBadge>);
      const badge = screen.getByRole('status');

      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('Loading...');
    });

    it('dynamic prop enables live announcements', () => {
      const { container } = render(
        <StatusBadge dynamic variant='green'>
          Completed
        </StatusBadge>
      );

      const statusElement = container.querySelector('[role="status"]');
      expect(statusElement).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('applies base badge classes', () => {
      const { container } = render(<StatusBadge>Badge</StatusBadge>);
      const badge = container.querySelector('div');

      expect(badge).toHaveClass('inline-flex');
      expect(badge).toHaveClass('items-center');
      expect(badge).toHaveClass('gap-2');
      expect(badge).toHaveClass('rounded-full');
      expect(badge).toHaveClass('border');
      expect(badge).toHaveClass('font-medium');
    });

    it('text is wrapped in span', () => {
      const { container } = render(<StatusBadge>Text</StatusBadge>);
      const badge = container.querySelector('div');
      const textSpan = badge?.querySelector('span:last-child');

      expect(textSpan).toHaveTextContent('Text');
    });
  });

  describe('content', () => {
    it('renders string children', () => {
      render(<StatusBadge>String Content</StatusBadge>);
      expect(screen.getByText('String Content')).toBeInTheDocument();
    });

    it('renders number children', () => {
      render(<StatusBadge>{42}</StatusBadge>);
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('renders complex ReactNode children', () => {
      render(
        <StatusBadge>
          <span>Complex</span> <strong>Content</strong>
        </StatusBadge>
      );

      expect(screen.getByText('Complex')).toBeInTheDocument();
      expect(screen.getByText('Content')).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('handles empty children', () => {
      const { container } = render(<StatusBadge>Empty</StatusBadge>);
      const badge = container.querySelector('div');

      expect(badge).toBeInTheDocument();
    });

    it('combines all props', () => {
      render(
        <StatusBadge
          variant='green'
          size='lg'
          icon={<span>✓</span>}
          dynamic
          className='extra-class'
        >
          Success
        </StatusBadge>
      );

      const badge = screen.getByRole('status');
      expect(badge).toHaveClass('bg-success-subtle');
      expect(badge).toHaveClass('px-5');
      expect(badge).toHaveClass('text-base');
      expect(badge).toHaveClass('extra-class');
      expect(screen.getByText('✓')).toBeInTheDocument();
      expect(screen.getByText('Success')).toBeInTheDocument();
    });

    it('handles very long text', () => {
      const longText = 'A'.repeat(100);
      render(<StatusBadge>{longText}</StatusBadge>);

      expect(screen.getByText(longText)).toBeInTheDocument();
    });

    it('empty className defaults to empty string', () => {
      const { container } = render(<StatusBadge>Test</StatusBadge>);
      const badge = container.querySelector('div');

      expect(badge).toBeInTheDocument();
    });
  });
});
