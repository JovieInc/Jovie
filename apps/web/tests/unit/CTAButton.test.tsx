import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CTAButton } from '@/components/atoms/CTAButton';

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
  it('renders a link when href is provided', () => {
    render(
      <CTAButton href='https://example.com' external>
        External Link
      </CTAButton>
    );

    const link = screen.getByRole('link', { name: /external link/i });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders a button when no href is provided', () => {
    render(<CTAButton>Click me</CTAButton>);

    const button = screen.getByRole('button', { name: /click me/i });
    expect(button).toBeInTheDocument();
  });

  it('calls onClick handler when enabled', () => {
    const handleClick = vi.fn();
    render(<CTAButton onClick={handleClick}>Click me</CTAButton>);

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('disables interactions while loading', () => {
    const handleClick = vi.fn();
    render(
      <CTAButton onClick={handleClick} isLoading>
        Loading
      </CTAButton>
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });
});
