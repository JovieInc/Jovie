<<<<<<< HEAD
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { IconButton } from '@/components/atoms/IconButton';

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

describe('IconButton', () => {
  const TestIcon = () => <span data-testid="test-icon">Icon</span>;

  describe('Button rendering', () => {
    it('renders as a button when no href is provided', () => {
      render(
        <IconButton ariaLabel="Test button">
          <TestIcon />
        </IconButton>
      );

      const button = screen.getByRole('button', { name: 'Test button' });
      expect(button).toBeInTheDocument();
      expect(screen.getByTestId('test-icon')).toBeInTheDocument();
    });

    it('applies disabled state correctly for button', () => {
      render(
        <IconButton ariaLabel="Test button" disabled>
          <TestIcon />
        </IconButton>
      );

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button).toHaveClass('opacity-50', 'cursor-not-allowed');
    });

    it('calls onClick handler when button is clicked and not disabled', () => {
      const handleClick = vi.fn();
      render(
        <IconButton ariaLabel="Test button" onClick={handleClick}>
          <TestIcon />
        </IconButton>
      );

      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('does not call onClick when button is disabled', () => {
      const handleClick = vi.fn();
      render(
        <IconButton ariaLabel="Test button" onClick={handleClick} disabled>
          <TestIcon />
        </IconButton>
      );

      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('Link rendering', () => {
    it('renders as a link when href is provided', () => {
      render(
        <IconButton ariaLabel="Test link" href="/test">
          <TestIcon />
        </IconButton>
      );

      const link = screen.getByRole('link', { name: 'Test link' });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/test');
      expect(screen.getByTestId('test-icon')).toBeInTheDocument();
    });

    it('applies target and rel attributes correctly for link', () => {
      render(
        <IconButton 
          ariaLabel="Test link" 
          href="/test" 
          target="_blank" 
          rel="noopener"
        >
          <TestIcon />
        </IconButton>
      );

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener');
    });

    it('applies disabled state correctly for link', () => {
      render(
        <IconButton ariaLabel="Test link" href="/test" disabled>
          <TestIcon />
        </IconButton>
      );

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('aria-disabled', 'true');
      expect(link).toHaveAttribute('tabIndex', '-1');
      expect(link).toHaveClass('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
    });

    it('prevents navigation when disabled link is clicked', () => {
      const preventDefaultSpy = vi.fn();
      
      render(
        <IconButton ariaLabel="Test link" href="/test" disabled>
          <TestIcon />
        </IconButton>
      );

      const link = screen.getByRole('link');
      const clickEvent = new MouseEvent('click', { bubbles: true });
      clickEvent.preventDefault = preventDefaultSpy;
      
      fireEvent(link, clickEvent);
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('allows navigation when link is not disabled', () => {
      const preventDefaultSpy = vi.fn();
      
      render(
        <IconButton ariaLabel="Test link" href="/test">
          <TestIcon />
        </IconButton>
      );

      const link = screen.getByRole('link');
      const clickEvent = new MouseEvent('click', { bubbles: true });
      clickEvent.preventDefault = preventDefaultSpy;
      
      fireEvent(link, clickEvent);
      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });
  });

  describe('Styling and variants', () => {
    it('applies size variants correctly', () => {
      const { rerender } = render(
        <IconButton ariaLabel="Test" size="sm">
          <TestIcon />
        </IconButton>
      );

      expect(screen.getByRole('button')).toHaveClass('h-8', 'w-8');

      rerender(
        <IconButton ariaLabel="Test" size="md">
          <TestIcon />
        </IconButton>
      );

      expect(screen.getByRole('button')).toHaveClass('h-9', 'w-9');
    });

    it('applies style variants correctly', () => {
      const { rerender } = render(
        <IconButton ariaLabel="Test" variant="subtle">
          <TestIcon />
        </IconButton>
      );

      expect(screen.getByRole('button')).toHaveClass('bg-surface-2');

      rerender(
        <IconButton ariaLabel="Test" variant="neutral">
          <TestIcon />
        </IconButton>
      );

      expect(screen.getByRole('button')).toHaveClass('bg-surface-1');
    });

    it('applies custom className correctly', () => {
      render(
        <IconButton ariaLabel="Test" className="custom-class">
          <TestIcon />
        </IconButton>
      );

      expect(screen.getByRole('button')).toHaveClass('custom-class');
    });

    it('applies title attribute correctly', () => {
      render(
        <IconButton ariaLabel="Test" title="Custom title">
          <TestIcon />
        </IconButton>
      );

      expect(screen.getByRole('button')).toHaveAttribute('title', 'Custom title');
    });
  });

  describe('data-state attribute', () => {
    it('has data-state="idle" by default for button', () => {
      render(
        <IconButton ariaLabel="Idle button">
          <TestIcon />
        </IconButton>
      );
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('data-state', 'idle');
    });

    it('has data-state="disabled" when disabled for button', () => {
      render(
        <IconButton ariaLabel="Disabled button" disabled>
          <TestIcon />
        </IconButton>
      );
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('data-state', 'disabled');
    });

    it('has data-state="idle" for link by default', () => {
      render(
        <IconButton ariaLabel="Link button" href="/test">
          <TestIcon />
        </IconButton>
      );
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('data-state', 'idle');
    });

    it('has data-state="disabled" for link when disabled', () => {
      render(
        <IconButton ariaLabel="Disabled link" href="/test" disabled>
          <TestIcon />
        </IconButton>
      );
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('data-state', 'disabled');
    });
  });
});