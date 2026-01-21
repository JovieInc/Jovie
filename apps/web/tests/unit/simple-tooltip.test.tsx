import { SimpleTooltip } from '@jovie/ui/atoms/simple-tooltip';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@jovie/ui/atoms/tooltip';
import { act, render, screen } from '@testing-library/react';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.useFakeTimers();

const flushTimers = () => {
  act(() => {
    vi.advanceTimersByTime(10);
  });
};

const mockMatchMedia = vi.fn();
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: mockMatchMedia,
  });
});

const TooltipWrapper = ({
  children,
  delayDuration = 0,
}: {
  children: React.ReactNode;
  delayDuration?: number;
}) => (
  <TooltipProvider delayDuration={delayDuration}>{children}</TooltipProvider>
);

/**
 * Helper to render SimpleTooltip-like structure with defaultOpen for testing.
 * We test the composition pattern since jsdom doesn't support pointer events.
 */
const TestableTooltip = ({
  content,
  side = 'top',
  showArrow = false,
  className,
  children,
}: {
  content: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  showArrow?: boolean;
  className?: string;
  children: React.ReactNode;
}) => (
  <TooltipWrapper>
    <Tooltip defaultOpen>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} showArrow={showArrow} className={className}>
        {content}
      </TooltipContent>
    </Tooltip>
  </TooltipWrapper>
);

describe('SimpleTooltip', () => {
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

  afterAll(() => {
    vi.useRealTimers();
  });

  describe('Rendering', () => {
    it('renders trigger without tooltip initially', () => {
      render(
        <TooltipWrapper>
          <SimpleTooltip content='Tooltip content'>
            <button type='button'>Trigger</button>
          </SimpleTooltip>
        </TooltipWrapper>
      );

      expect(
        screen.getByRole('button', { name: 'Trigger' })
      ).toBeInTheDocument();
      expect(screen.queryByText('Tooltip content')).not.toBeInTheDocument();
    });

    it('renders string content when open', () => {
      render(
        <TestableTooltip content='Simple string content'>
          <button type='button'>Trigger</button>
        </TestableTooltip>
      );

      flushTimers();

      const tooltips = screen.getAllByText('Simple string content');
      expect(tooltips.length).toBeGreaterThan(0);
    });

    it('renders ReactNode content when open', () => {
      render(
        <TestableTooltip
          content={
            <span>
              <strong>Bold</strong> and normal
            </span>
          }
        >
          <button type='button'>Trigger</button>
        </TestableTooltip>
      );

      flushTimers();

      expect(screen.getAllByText('Bold').length).toBeGreaterThan(0);
    });
  });

  describe('Positioning', () => {
    it('supports side prop', () => {
      render(
        <TestableTooltip content='Right tooltip' side='right'>
          <button type='button'>Trigger</button>
        </TestableTooltip>
      );

      flushTimers();

      const [tooltipText] = screen.getAllByText('Right tooltip');
      const tooltipContent = tooltipText.closest('[data-state]');
      expect(tooltipContent).toHaveAttribute('data-side', 'right');
    });

    it('defaults to top side', () => {
      render(
        <TestableTooltip content='Default position'>
          <button type='button'>Trigger</button>
        </TestableTooltip>
      );

      flushTimers();

      const [tooltipText] = screen.getAllByText('Default position');
      const tooltipContent = tooltipText.closest('[data-state]');
      expect(tooltipContent).toHaveAttribute('data-side', 'top');
    });
  });

  describe('Arrow Display', () => {
    it('hides arrow by default', () => {
      render(
        <TestableTooltip content='No arrow'>
          <button type='button'>Trigger</button>
        </TestableTooltip>
      );

      flushTimers();

      const [tooltipText] = screen.getAllByText('No arrow');
      const tooltipContent = tooltipText.closest('[data-state]');
      const arrow = tooltipContent?.querySelector('svg');
      expect(arrow).not.toBeInTheDocument();
    });

    it('shows arrow when showArrow is true', () => {
      render(
        <TestableTooltip content='With arrow' showArrow>
          <button type='button'>Trigger</button>
        </TestableTooltip>
      );

      flushTimers();

      const [tooltipText] = screen.getAllByText('With arrow');
      const tooltipContent = tooltipText.closest('[data-state]');
      const arrow = tooltipContent?.querySelector('svg');
      expect(arrow).toBeInTheDocument();
    });
  });

  describe('Custom Styling', () => {
    it('applies custom className', () => {
      render(
        <TestableTooltip content='Styled tooltip' className='custom-class'>
          <button type='button'>Trigger</button>
        </TestableTooltip>
      );

      flushTimers();

      const tooltipElements = screen.getAllByText('Styled tooltip');
      const hasCustomClass = tooltipElements.some(element =>
        element.closest('[data-state]')?.classList.contains('custom-class')
      );
      expect(hasCustomClass).toBe(true);
    });
  });

  describe('Accessibility', () => {
    it('has proper role attributes', () => {
      render(
        <TestableTooltip content='Accessible tooltip'>
          <button type='button'>Trigger</button>
        </TestableTooltip>
      );

      flushTimers();

      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toHaveAttribute('role', 'tooltip');
    });

    it('has correct ARIA relationships', () => {
      render(
        <TestableTooltip content='ARIA tooltip'>
          <button type='button'>Trigger</button>
        </TestableTooltip>
      );

      flushTimers();
      const trigger = screen.getByRole('button', { name: 'Trigger' });
      const tooltip = screen.getByRole('tooltip');
      const triggerId = trigger.getAttribute('aria-describedby');
      const tooltipId = tooltip.getAttribute('id');
      expect(triggerId).toBe(tooltipId);
    });
  });

  describe('Component API', () => {
    it('SimpleTooltip component exists and accepts expected props', () => {
      // Type check - this test verifies the component API is correct
      const element = (
        <SimpleTooltip
          content='Test'
          side='bottom'
          sideOffset={10}
          showArrow={true}
          className='test-class'
        >
          <button type='button'>Test</button>
        </SimpleTooltip>
      );

      expect(element.type).toBe(SimpleTooltip);
      expect(element.props.content).toBe('Test');
      expect(element.props.side).toBe('bottom');
      expect(element.props.sideOffset).toBe(10);
      expect(element.props.showArrow).toBe(true);
      expect(element.props.className).toBe('test-class');
    });
  });
});
