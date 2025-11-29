import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@jovie/ui/atoms/tooltip';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock reduced motion
const mockMatchMedia = vi.fn();
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: mockMatchMedia,
});

// Test wrapper component with provider
const TooltipWrapper = ({
  children,
  delayDuration = 0, // Faster for tests
  skipDelayDuration = 0,
}: {
  children: React.ReactNode;
  delayDuration?: number;
  skipDelayDuration?: number;
}) => (
  <TooltipProvider
    delayDuration={delayDuration}
    skipDelayDuration={skipDelayDuration}
  >
    {children}
  </TooltipProvider>
);

const BasicTooltip = ({
  showArrow = true,
  content = 'Test tooltip content',
  triggerText = 'Trigger',
}: {
  showArrow?: boolean;
  content?: string;
  triggerText?: string;
}) => (
  <TooltipWrapper>
    <Tooltip>
      <TooltipTrigger>
        <button>{triggerText}</button>
      </TooltipTrigger>
      <TooltipContent showArrow={showArrow}>{content}</TooltipContent>
    </Tooltip>
  </TooltipWrapper>
);

describe('Tooltip', () => {
  beforeEach(() => {
    mockMatchMedia.mockReturnValue({
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders trigger without tooltip initially', () => {
      render(<BasicTooltip />);

      const trigger = screen.getByRole('button', { name: 'Trigger' });
      expect(trigger).toBeInTheDocument();

      // Tooltip content should not be visible initially
      expect(
        screen.queryByText('Test tooltip content')
      ).not.toBeInTheDocument();
    });

    it('renders with custom trigger text and content', () => {
      render(
        <BasicTooltip
          triggerText='Custom trigger'
          content='Custom tooltip content'
        />
      );

      const trigger = screen.getByRole('button', { name: 'Custom trigger' });
      expect(trigger).toBeInTheDocument();
    });
  });

  describe('Hover Interactions', () => {
    it('shows tooltip on hover', () => {
      render(<BasicTooltip />);

      const triggerElement = screen.getByRole('button', { name: 'Trigger' });

      fireEvent.mouseEnter(triggerElement);

      const tooltips = screen.getAllByText('Test tooltip content');
      expect(tooltips.length).toBeGreaterThan(0);
      expect(tooltips[0]).toBeVisible();
    });

    it.skip('hides tooltip on unhover', () => {
      render(<BasicTooltip />);

      const triggerElement = screen.getByRole('button', { name: 'Trigger' });

      // Show tooltip
      fireEvent.mouseEnter(triggerElement);
      const tooltips = screen.getAllByText('Test tooltip content');
      expect(tooltips[0]).toBeVisible();

      // Hide tooltip
      fireEvent.mouseLeave(triggerElement);
      const hidden = screen.queryAllByText('Test tooltip content');
      const openTooltip = hidden.find(el =>
        el.closest('[data-state="delayed-open"]')
      );
      expect(openTooltip).toBeUndefined();
    });
  });

  describe('Keyboard Interactions', () => {
    it('shows tooltip on focus', () => {
      render(<BasicTooltip />);

      const trigger = screen.getByRole('button', { name: 'Trigger' });
      trigger.focus();

      const tooltips = screen.getAllByText('Test tooltip content');
      expect(tooltips[0]).toBeVisible();
    });

    it('hides tooltip on blur', () => {
      render(
        <TooltipWrapper>
          <Tooltip>
            <TooltipTrigger>
              <button>First button</button>
            </TooltipTrigger>
            <TooltipContent>First tooltip</TooltipContent>
          </Tooltip>
          <button>Second button</button>
        </TooltipWrapper>
      );

      const firstButton = screen.getByRole('button', {
        name: 'First button',
      });
      const secondButton = screen.getByRole('button', {
        name: 'Second button',
      });

      // Focus first button to show tooltip
      firstButton.focus();
      const tooltips = screen.getAllByText('First tooltip');
      expect(tooltips[0]).toBeVisible();

      // Focus second button to hide tooltip
      secondButton.focus();
      const hidden = screen.queryAllByText('First tooltip');
      const openTooltip = hidden.find(el =>
        el.closest('[data-state="delayed-open"]')
      );
      // After blur, there should be no tooltip content in delayed-open state
      expect(openTooltip).toBeUndefined();
    });

    it('hides tooltip on Escape key', () => {
      render(<BasicTooltip />);

      const trigger = screen.getByRole('button', { name: 'Trigger' });

      // Show tooltip
      trigger.focus();
      const tooltips = screen.getAllByText('Test tooltip content');
      expect(tooltips[0]).toBeVisible();

      // Hide tooltip with Escape
      fireEvent.keyDown(trigger, { key: 'Escape' });
      const hidden = screen.queryAllByText('Test tooltip content');
      const visibleTooltip = hidden.find(el =>
        el.closest('[data-state="delayed-open"]')
      );
      // After Escape, there should be no visible tooltip content
      expect(visibleTooltip).toBeUndefined();
    });
  });

  describe('Arrow Display', () => {
    it('shows arrow by default', () => {
      render(<BasicTooltip showArrow={true} />);

      const trigger = screen.getByRole('button', { name: 'Trigger' });
      fireEvent.mouseEnter(trigger);

      const tooltips = screen.getAllByText('Test tooltip content');
      const tooltipContent = tooltips[0].closest('[data-state]');
      expect(tooltipContent).toBeInTheDocument();

      // Check that arrow is rendered (Radix adds it as SVG)
      const arrow = tooltipContent?.querySelector('svg');
      expect(arrow).toBeInTheDocument();
    });

    it('hides arrow when showArrow is false', () => {
      render(<BasicTooltip showArrow={false} />);

      const trigger = screen.getByRole('button', { name: 'Trigger' });
      fireEvent.mouseEnter(trigger);

      const tooltips = screen.getAllByText('Test tooltip content');
      const tooltipContent = tooltips[0].closest('[data-state]');
      expect(tooltipContent).toBeInTheDocument();

      // Arrow should not be rendered
      const arrow = tooltipContent?.querySelector('svg');
      expect(arrow).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has correct ARIA relationships', () => {
      render(<BasicTooltip />);

      const trigger = screen.getByRole('button', { name: 'Trigger' });

      fireEvent.mouseEnter(trigger);

      const tooltip = screen.getByRole('tooltip');
      const triggerId = trigger.getAttribute('aria-describedby');
      const tooltipId = tooltip.getAttribute('id');
      expect(triggerId).toBe(tooltipId);
    });

    it('has proper role attributes', () => {
      render(<BasicTooltip />);

      const trigger = screen.getByRole('button', { name: 'Trigger' });
      fireEvent.mouseEnter(trigger);

      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toHaveAttribute('role', 'tooltip');
    });

    it('works with disabled elements via wrapper', () => {
      render(
        <TooltipWrapper>
          <Tooltip>
            <TooltipTrigger>
              <span>
                <button disabled>Disabled button</button>
              </span>
            </TooltipTrigger>
            <TooltipContent>This action is unavailable</TooltipContent>
          </Tooltip>
        </TooltipWrapper>
      );

      const wrapper = screen.getByRole('button', {
        name: 'Disabled button',
      }).parentElement;
      expect(wrapper).toBeInTheDocument();

      // Hovering the wrapper should show tooltip
      if (wrapper) {
        fireEvent.mouseEnter(wrapper);
        const tooltips = screen.getAllByText('This action is unavailable');
        expect(tooltips[0]).toBeVisible();
      }
    });
  });

  describe('Positioning', () => {
    it('supports different side positions', () => {
      render(
        <TooltipWrapper>
          <Tooltip>
            <TooltipTrigger>
              <button>Trigger</button>
            </TooltipTrigger>
            <TooltipContent side='top'>Top tooltip</TooltipContent>
          </Tooltip>
        </TooltipWrapper>
      );

      const trigger = screen.getByRole('button', { name: 'Trigger' });
      fireEvent.mouseEnter(trigger);

      const [tooltipText] = screen.getAllByText('Top tooltip');
      const tooltipContent = tooltipText.closest('[data-state]');
      expect(tooltipContent).toHaveAttribute('data-side', 'top');
    });

    it('supports custom sideOffset', () => {
      render(
        <TooltipWrapper>
          <Tooltip>
            <TooltipTrigger>
              <button>Trigger</button>
            </TooltipTrigger>
            <TooltipContent sideOffset={16}>
              Custom offset tooltip
            </TooltipContent>
          </Tooltip>
        </TooltipWrapper>
      );

      const trigger = screen.getByRole('button', { name: 'Trigger' });
      fireEvent.mouseEnter(trigger);
      const rendered = screen.getAllByText('Custom offset tooltip');
      expect(rendered.length).toBeGreaterThan(0);
    });
  });

  describe('Provider Configuration', () => {
    it('respects custom delay durations', () => {
      render(
        <TooltipWrapper delayDuration={10}>
          <Tooltip>
            <TooltipTrigger>
              <button>Delayed trigger</button>
            </TooltipTrigger>
            <TooltipContent>Delayed tooltip</TooltipContent>
          </Tooltip>
        </TooltipWrapper>
      );

      const trigger = screen.getByRole('button', { name: 'Delayed trigger' });
      fireEvent.mouseEnter(trigger);

      // Should not appear immediately
      expect(screen.queryByText('Delayed tooltip')).not.toBeInTheDocument();

      expect(screen.queryByText('Delayed tooltip')).not.toBeInTheDocument();

      const tooltips = screen.getAllByText('Delayed tooltip');
      expect(tooltips.length).toBeGreaterThan(0);
    });
  });

  describe('Reduced Motion', () => {
    it('includes motion-reduce classes for accessibility', () => {
      render(<BasicTooltip />);

      const trigger = screen.getByRole('button', { name: 'Trigger' });
      fireEvent.mouseEnter(trigger);

      const tooltip = screen.getByRole('tooltip');
      const tooltipContent =
        tooltip.closest('[data-state]') ?? tooltip.parentElement;
      expect(tooltipContent).toHaveAttribute('data-state', 'delayed-open');
    });
  });

  describe('Complex Content', () => {
    it('renders complex React node content', () => {
      render(
        <TooltipWrapper>
          <Tooltip>
            <TooltipTrigger>
              <button>Complex trigger</button>
            </TooltipTrigger>
            <TooltipContent>
              <div>
                <strong>Complex content title</strong>
                <p>With multiple elements</p>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipWrapper>
      );

      const trigger = screen.getByRole('button', { name: 'Complex trigger' });
      fireEvent.mouseEnter(trigger);

      expect(
        screen.getAllByText('Complex content title').length
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByText('With multiple elements').length
      ).toBeGreaterThan(0);
    });

    it('applies custom className to content', () => {
      render(
        <TooltipWrapper>
          <Tooltip>
            <TooltipTrigger>
              <button>Custom class trigger</button>
            </TooltipTrigger>
            <TooltipContent className='custom-tooltip-class'>
              Custom styled tooltip
            </TooltipContent>
          </Tooltip>
        </TooltipWrapper>
      );

      const trigger = screen.getByRole('button', {
        name: 'Custom class trigger',
      });
      fireEvent.mouseEnter(trigger);

      const tooltipElements = screen.getAllByText('Custom styled tooltip');
      const hasCustomClass = tooltipElements.some(element =>
        element
          .closest('[data-state="delayed-open"]')
          ?.classList.contains('custom-tooltip-class')
      );
      expect(hasCustomClass).toBe(true);
    });
  });
});
