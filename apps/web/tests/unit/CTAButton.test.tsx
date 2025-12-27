import { fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CTAButton } from '@/components/ui/CTAButton';

// Mock the next/link component
vi.mock('next/link', () => {
  return {
    __esModule: true,
    default: ({
      href,
      children,
      ...rest
    }: {
      href: string;
      children: React.ReactNode;
      [key: string]: unknown;
    }) => {
      return (
        <a href={href} {...rest}>
          {children}
        </a>
      );
    },
  };
});

// Mock the useTheme hook
vi.mock('next-themes', () => ({
  useTheme: () => ({
    theme: 'light',
    systemTheme: 'light',
  }),
}));

describe('CTAButton', () => {
  it('renders correctly with default props', () => {
    render(<CTAButton href='/test'>Click me</CTAButton>);

    const button = screen.getByRole('link', { name: /click me/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('href', '/test');
    expect(button).toHaveClass('bg-btn-primary');
  });

  it('renders as a button when no href is provided', () => {
    render(<CTAButton>Click me</CTAButton>);

    const button = screen.getByRole('button', { name: /click me/i });
    expect(button).toBeInTheDocument();
  });

  it('applies different variants correctly', () => {
    const { rerender } = render(
      <CTAButton variant='primary'>Primary</CTAButton>
    );
    expect(screen.getByRole('button')).toHaveClass('bg-btn-primary');

    rerender(<CTAButton variant='secondary'>Secondary</CTAButton>);
    expect(screen.getByRole('button')).toHaveClass('bg-surface-2');

    rerender(<CTAButton variant='outline'>Outline</CTAButton>);
    expect(screen.getByRole('button')).toHaveClass('border-border');
  });

  it('applies different sizes correctly', () => {
    const { rerender } = render(<CTAButton size='sm'>Small</CTAButton>);
    expect(screen.getByRole('button')).toHaveClass('h-8');

    rerender(<CTAButton size='md'>Medium</CTAButton>);
    expect(screen.getByRole('button')).toHaveClass('h-10');

    rerender(<CTAButton size='lg'>Large</CTAButton>);
    expect(screen.getByRole('button')).toHaveClass('h-11');
  });

  it('renders in loading state correctly', () => {
    render(<CTAButton isLoading>Loading</CTAButton>);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('data-state', 'loading');
  });

  it('renders in success state correctly', () => {
    render(<CTAButton isSuccess>Success</CTAButton>);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('data-state', 'success');
  });

  it('renders in disabled state correctly', () => {
    render(<CTAButton disabled>Disabled</CTAButton>);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('data-state', 'disabled');
  });

  it('calls onClick handler when clicked', () => {
    const handleClick = vi.fn();
    render(<CTAButton onClick={handleClick}>Click me</CTAButton>);

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick when disabled', () => {
    const handleClick = vi.fn();
    render(
      <CTAButton onClick={handleClick} disabled>
        Click me
      </CTAButton>
    );

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('does not call onClick when loading', () => {
    const handleClick = vi.fn();
    render(
      <CTAButton onClick={handleClick} isLoading>
        Click me
      </CTAButton>
    );

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('renders with an icon correctly', () => {
    render(
      <CTAButton icon={<span data-testid='test-icon' />}>With Icon</CTAButton>
    );

    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
    expect(screen.getByText('With Icon')).toBeInTheDocument();
  });

  it('renders as an external link when external prop is true', () => {
    render(
      <CTAButton href='https://example.com' external>
        External Link
      </CTAButton>
    );

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('applies custom className correctly', () => {
    render(<CTAButton className='custom-class'>Custom Class</CTAButton>);

    expect(screen.getByRole('button')).toHaveClass('custom-class');
  });

  it('applies aria-label correctly', () => {
    render(<CTAButton aria-label='Custom Label'>Button</CTAButton>);

    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      'Custom Label'
    );
  });
});
