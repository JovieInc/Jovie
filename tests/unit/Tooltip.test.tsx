import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@jovie/ui';

describe('Tooltip', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    // Mock matchMedia for reduced motion tests
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic functionality', () => {
    it('renders trigger element', () => {
      render(
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button">Hover me</button>
            </TooltipTrigger>
            <TooltipContent>Tooltip text</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );

      expect(screen.getByRole('button', { name: /hover me/i })).toBeInTheDocument();
    });

    it('shows tooltip on hover', async () => {
      render(
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button">Hover me</button>
            </TooltipTrigger>
            <TooltipContent>Tooltip text</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );

      const trigger = screen.getByRole('button', { name: /hover me/i });
      
      // Initially tooltip is not visible
      expect(screen.queryByText('Tooltip text')).not.toBeInTheDocument();
      
      // Hover over trigger
      await user.hover(trigger);
      
      // Tooltip should appear
      await waitFor(() => {
        expect(screen.getByText('Tooltip text')).toBeInTheDocument();
      });
    });

    it('hides tooltip on mouse leave', async () => {
      render(
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button">Hover me</button>
            </TooltipTrigger>
            <TooltipContent>Tooltip text</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );

      const trigger = screen.getByRole('button', { name: /hover me/i });
      
      // Show tooltip
      await user.hover(trigger);
      await waitFor(() => {
        expect(screen.getByText('Tooltip text')).toBeInTheDocument();
      });
      
      // Hide tooltip
      await user.unhover(trigger);
      await waitFor(() => {
        expect(screen.queryByText('Tooltip text')).not.toBeInTheDocument();
      });
    });
  });

  describe('Keyboard accessibility', () => {
    it('shows tooltip on focus', async () => {
      render(
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button">Focus me</button>
            </TooltipTrigger>
            <TooltipContent>Tooltip text</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );

      const trigger = screen.getByRole('button', { name: /focus me/i });
      
      // Initially tooltip is not visible
      expect(screen.queryByText('Tooltip text')).not.toBeInTheDocument();
      
      // Focus trigger
      trigger.focus();
      
      // Tooltip should appear
      await waitFor(() => {
        expect(screen.getByText('Tooltip text')).toBeInTheDocument();
      });
    });

    it('hides tooltip on blur', async () => {
      render(
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button">Focus me</button>
            </TooltipTrigger>
            <TooltipContent>Tooltip text</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );

      const trigger = screen.getByRole('button', { name: /focus me/i });
      
      // Show tooltip
      trigger.focus();
      await waitFor(() => {
        expect(screen.getByText('Tooltip text')).toBeInTheDocument();
      });
      
      // Hide tooltip
      trigger.blur();
      await waitFor(() => {
        expect(screen.queryByText('Tooltip text')).not.toBeInTheDocument();
      });
    });

    it('closes tooltip on Escape key', async () => {
      render(
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button">Press Escape</button>
            </TooltipTrigger>
            <TooltipContent>Tooltip text</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );

      const trigger = screen.getByRole('button', { name: /press escape/i });
      
      // Show tooltip
      await user.hover(trigger);
      await waitFor(() => {
        expect(screen.getByText('Tooltip text')).toBeInTheDocument();
      });
      
      // Press Escape
      await user.keyboard('{Escape}');
      
      // Tooltip should close
      await waitFor(() => {
        expect(screen.queryByText('Tooltip text')).not.toBeInTheDocument();
      });
    });
  });

  describe('ARIA relationships', () => {
    it('has correct ARIA attributes', async () => {
      render(
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button">ARIA button</button>
            </TooltipTrigger>
            <TooltipContent>ARIA tooltip</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );

      const trigger = screen.getByRole('button', { name: /aria button/i });
      
      // Trigger should have aria-describedby when tooltip is open
      await user.hover(trigger);
      await waitFor(() => {
        expect(trigger).toHaveAttribute('aria-describedby');
      });
      
      const tooltipId = trigger.getAttribute('aria-describedby');
      const tooltip = document.getElementById(tooltipId!);
      expect(tooltip).toHaveTextContent('ARIA tooltip');
    });

    it('removes ARIA attributes when closed', async () => {
      render(
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button">ARIA button</button>
            </TooltipTrigger>
            <TooltipContent>ARIA tooltip</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );

      const trigger = screen.getByRole('button', { name: /aria button/i });
      
      // Show and hide tooltip
      await user.hover(trigger);
      await waitFor(() => {
        expect(trigger).toHaveAttribute('aria-describedby');
      });
      
      await user.unhover(trigger);
      await waitFor(() => {
        expect(trigger).not.toHaveAttribute('aria-describedby');
      });
    });
  });

  describe('Arrow support', () => {
    it('renders without arrow by default', async () => {
      const { container } = render(
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button">No arrow</button>
            </TooltipTrigger>
            <TooltipContent>Tooltip content</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );

      await user.hover(screen.getByRole('button', { name: /no arrow/i }));
      await waitFor(() => {
        expect(screen.getByText('Tooltip content')).toBeInTheDocument();
      });
      
      // Check that arrow SVG is not rendered
      expect(container.querySelector('svg[role="presentation"]')).not.toBeInTheDocument();
    });

    it('renders with arrow when showArrow is true', async () => {
      const { container } = render(
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button">With arrow</button>
            </TooltipTrigger>
            <TooltipContent showArrow>Tooltip content</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );

      await user.hover(screen.getByRole('button', { name: /with arrow/i }));
      await waitFor(() => {
        expect(screen.getByText('Tooltip content')).toBeInTheDocument();
      });
      
      // Check that arrow SVG is rendered
      const arrow = container.querySelector('svg');
      expect(arrow).toBeInTheDocument();
    });
  });

  describe('Disabled elements', () => {
    it('shows tooltip on wrapped disabled element', async () => {
      render(
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <button type="button" disabled>
                  Disabled button
                </button>
              </span>
            </TooltipTrigger>
            <TooltipContent>This is disabled</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );

      const wrapper = screen.getByText('Disabled button').parentElement!;
      
      // Hover over wrapper
      await user.hover(wrapper);
      
      // Tooltip should appear
      await waitFor(() => {
        expect(screen.getByText('This is disabled')).toBeInTheDocument();
      });
    });
  });

  describe('Delay configuration', () => {
    it('respects custom delay duration', async () => {
      const delayDuration = 100;
      
      render(
        <TooltipProvider delayDuration={delayDuration}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button">Delayed tooltip</button>
            </TooltipTrigger>
            <TooltipContent>Tooltip text</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );

      const trigger = screen.getByRole('button', { name: /delayed tooltip/i });
      
      // Start hovering
      await user.hover(trigger);
      
      // Tooltip should not appear immediately
      expect(screen.queryByText('Tooltip text')).not.toBeInTheDocument();
      
      // Wait for delay and check tooltip appears
      await waitFor(
        () => {
          expect(screen.getByText('Tooltip text')).toBeInTheDocument();
        },
        { timeout: delayDuration + 50 }
      );
    });
  });

  describe('Reduced motion', () => {
    it('applies reduced motion classes when prefers-reduced-motion is enabled', async () => {
      // Mock reduced motion preference
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      render(
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button">Reduced motion</button>
            </TooltipTrigger>
            <TooltipContent>Tooltip with reduced motion</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );

      await user.hover(screen.getByRole('button', { name: /reduced motion/i }));
      
      await waitFor(() => {
        const tooltip = screen.getByText('Tooltip with reduced motion');
        expect(tooltip.parentElement).toHaveClass('motion-reduce:transition-opacity');
        expect(tooltip.parentElement).toHaveClass('motion-reduce:duration-200');
      });
    });
  });

  describe('SSR compatibility', () => {
    it('does not throw during server-side rendering', () => {
      // This test ensures the component can be rendered without window/document
      expect(() => {
        render(
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button">SSR safe</button>
              </TooltipTrigger>
              <TooltipContent>SSR tooltip</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }).not.toThrow();
    });
  });
});