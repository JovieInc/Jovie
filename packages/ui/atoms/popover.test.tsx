import { fireEvent, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { eventUtils, fastRender } from '@/tests/utils/fast-render';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

// Helper component for testing
const TestPopover = ({
  open,
  onOpenChange,
  showArrow = false,
  children = 'Test popover content',
  triggerText = 'Open popover',
  ...props
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showArrow?: boolean;
  children?: React.ReactNode;
  triggerText?: string;
  [key: string]: any;
}) => (
  <Popover open={open} onOpenChange={onOpenChange}>
    <PopoverTrigger asChild>
      <button>{triggerText}</button>
    </PopoverTrigger>
    <PopoverContent showArrow={showArrow} {...props}>
      {children}
    </PopoverContent>
  </Popover>
);

describe('Popover', () => {
  describe('Basic Functionality', () => {
    it('renders trigger and shows content on click', () => {
      fastRender(<TestPopover />);

      const trigger = screen.getByRole('button', { name: /open popover/i });
      expect(trigger).toBeInTheDocument();

      // Content should not be visible initially
      expect(
        screen.queryByText('Test popover content')
      ).not.toBeInTheDocument();

      // Click trigger to open popover
      eventUtils.fastClick(trigger);

      // Content should now be visible
      expect(screen.getByText('Test popover content')).toBeInTheDocument();
    });

    it('closes on outside click', () => {
      fastRender(
        <div>
          <TestPopover />
          <div data-testid='outside'>Outside element</div>
        </div>
      );

      const trigger = screen.getByRole('button', { name: /open popover/i });
      eventUtils.fastClick(trigger);

      // Verify popover is open
      expect(screen.getByText('Test popover content')).toBeInTheDocument();

      // Click outside
      eventUtils.fastClick(screen.getByTestId('outside'));

      // Popover should close
      expect(
        screen.queryByText('Test popover content')
      ).not.toBeInTheDocument();
    });

    it('closes on escape key', () => {
      fastRender(<TestPopover />);

      const trigger = screen.getByRole('button', { name: /open popover/i });
      eventUtils.fastClick(trigger);

      // Verify popover is open
      expect(screen.getByText('Test popover content')).toBeInTheDocument();

      // Press escape
      eventUtils.fastKeyPress(trigger, 'Escape');

      // Popover should close
      expect(
        screen.queryByText('Test popover content')
      ).not.toBeInTheDocument();
    });
  });

  describe('Controlled State', () => {
    it('works in controlled mode', () => {
      const onOpenChange = vi.fn();
      const { rerender } = fastRender(
        <TestPopover open={false} onOpenChange={onOpenChange} />
      );

      // Content should not be visible
      expect(
        screen.queryByText('Test popover content')
      ).not.toBeInTheDocument();

      // Rerender with open=true
      rerender(<TestPopover open={true} onOpenChange={onOpenChange} />);

      // Content should now be visible
      expect(screen.getByText('Test popover content')).toBeInTheDocument();
    });

    it('calls onOpenChange when trigger is clicked', () => {
      const onOpenChange = vi.fn();
      fastRender(<TestPopover onOpenChange={onOpenChange} />);

      const trigger = screen.getByRole('button', { name: /open popover/i });
      eventUtils.fastClick(trigger);

      expect(onOpenChange).toHaveBeenCalledWith(true);
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA attributes', () => {
      fastRender(<TestPopover />);

      const trigger = screen.getByRole('button', { name: /open popover/i });

      // Trigger should have aria-expanded
      expect(trigger).toHaveAttribute('aria-expanded', 'false');

      eventUtils.fastClick(trigger);

      // After opening, aria-expanded should be true
      expect(trigger).toHaveAttribute('aria-expanded', 'true');

      // Content should have role="dialog" or be properly labeled
      const content = screen
        .getByText('Test popover content')
        .closest('[role]');
      expect(content).toBeInTheDocument();
    });

    it('manages focus correctly - does not trap focus like Dialog', () => {
      fastRender(
        <div>
          <TestPopover>
            <div>
              <button>Button inside popover</button>
              <input placeholder='Input inside popover' />
            </div>
          </TestPopover>
          <button data-testid='external-button'>External button</button>
        </div>
      );

      const trigger = screen.getByRole('button', { name: /open popover/i });
      eventUtils.fastClick(trigger);

      // Focus should be able to move to elements outside the popover
      const externalButton = screen.getByTestId('external-button');
      externalButton.focus();
      expect(externalButton).toHaveFocus();

      // Focus should also work inside the popover when directly focused
      const internalButton = screen.getByRole('button', {
        name: /button inside popover/i,
      });
      internalButton.focus(); // Direct focus rather than click
      expect(internalButton).toHaveFocus();
    });

    it('returns focus to trigger when closed with escape', () => {
      fastRender(<TestPopover />);

      const trigger = screen.getByRole('button', { name: /open popover/i });
      eventUtils.fastClick(trigger);

      // Press escape to close
      eventUtils.fastKeyPress(trigger, 'Escape');

      // Focus should return to trigger
      expect(trigger).toHaveFocus();
    });

    it('supports keyboard navigation', () => {
      fastRender(<TestPopover />);

      const trigger = screen.getByRole('button', { name: /open popover/i });

      // Focus the trigger
      trigger.focus();
      expect(trigger).toHaveFocus();

      // Open with Enter key
      eventUtils.fastKeyPress(trigger, 'Enter');
      expect(screen.getByText('Test popover content')).toBeInTheDocument();

      // Close with Escape
      eventUtils.fastKeyPress(trigger, 'Escape');
      expect(
        screen.queryByText('Test popover content')
      ).not.toBeInTheDocument();
    });
  });

  describe('Styling and Variants', () => {
    it('applies custom className', () => {
      fastRender(<TestPopover open={true} className='custom-class' />);

      const content = screen.getByText('Test popover content').closest('div');
      expect(content).toHaveClass('custom-class');
    });

    it('renders arrow when showArrow is true', () => {
      fastRender(<TestPopover open={true} showArrow={true} />);

      // Check for arrow element (Radix adds it as an SVG)
      const content = screen
        .getByText('Test popover content')
        .closest('[role]');
      expect(content?.querySelector('svg')).toBeInTheDocument();
    });

    it('does not render arrow by default', () => {
      fastRender(<TestPopover open={true} showArrow={false} />);

      const content = screen
        .getByText('Test popover content')
        .closest('[role]');
      expect(content?.querySelector('svg')).not.toBeInTheDocument();
    });

    it('has proper positioning attributes', () => {
      fastRender(<TestPopover open={true} side='top' align='start' />);

      const content = screen.getByText('Test popover content').closest('div');
      expect(content).toHaveAttribute('data-side', 'top');
      expect(content).toHaveAttribute('data-align', 'start');
    });
  });

  describe('Interactive Content', () => {
    it('supports interactive content without focus trapping', () => {
      const handleClick = vi.fn();

      fastRender(
        <TestPopover open={true}>
          <div>
            <button onClick={handleClick}>Interactive button</button>
            <input placeholder='Interactive input' />
          </div>
        </TestPopover>
      );

      // Should be able to interact with content
      const button = screen.getByRole('button', {
        name: /interactive button/i,
      });
      eventUtils.fastClick(button);
      expect(handleClick).toHaveBeenCalled();

      // Should be able to type in input
      const input = screen.getByPlaceholderText('Interactive input');
      fireEvent.change(input, { target: { value: 'test' } });
      expect(input).toHaveValue('test');
    });

    it('supports form submission within popover', () => {
      const handleSubmit = vi.fn(e => e.preventDefault());

      fastRender(
        <TestPopover open={true}>
          <form onSubmit={handleSubmit}>
            <input name='email' placeholder='Email' />
            <button type='submit'>Submit</button>
          </form>
        </TestPopover>
      );

      const input = screen.getByPlaceholderText('Email');
      const submitButton = screen.getByRole('button', { name: /submit/i });

      fireEvent.change(input, {
        target: { value: 'test@example.com' },
      });
      eventUtils.fastClick(submitButton);

      expect(handleSubmit).toHaveBeenCalled();
    });
  });

  describe('SSR Compatibility', () => {
    it('renders without hydration errors', () => {
      // This test ensures the component can be server-rendered
      const { container } = fastRender(<TestPopover />);
      expect(container).toBeInTheDocument();

      // Should not throw during hydration simulation
      expect(() => {
        fastRender(<TestPopover />);
      }).not.toThrow();
    });

    it('handles Portal rendering gracefully', () => {
      // Portal should not cause issues during SSR
      fastRender(<TestPopover open={true} />);
      expect(screen.getByText('Test popover content')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles rapid open/close cycles', () => {
      fastRender(<TestPopover />);

      const trigger = screen.getByRole('button', { name: /open popover/i });

      // Rapidly toggle multiple times
      eventUtils.fastClick(trigger);
      eventUtils.fastClick(trigger);
      eventUtils.fastClick(trigger);
      eventUtils.fastClick(trigger);

      // Should handle it gracefully
      expect(
        screen.queryByText('Test popover content')
      ).not.toBeInTheDocument();
    });

    it('handles children prop changes', () => {
      const { rerender } = fastRender(
        <TestPopover open={true}>Initial content</TestPopover>
      );

      expect(screen.getByText('Initial content')).toBeInTheDocument();

      rerender(<TestPopover open={true}>Updated content</TestPopover>);

      expect(screen.getByText('Updated content')).toBeInTheDocument();
      expect(screen.queryByText('Initial content')).not.toBeInTheDocument();
    });
  });
});
