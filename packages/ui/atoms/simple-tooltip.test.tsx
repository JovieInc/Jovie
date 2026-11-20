import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '../test-utils/a11y';
import { SimpleTooltip } from './simple-tooltip';
import { TooltipProvider } from './tooltip';

// Wrapper component that provides TooltipProvider
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
);

describe('SimpleTooltip', () => {
  describe('Basic Functionality', () => {
    it('renders trigger element', () => {
      render(
        <TestWrapper>
          <SimpleTooltip content='Tooltip text'>
            <button type='button'>Hover me</button>
          </SimpleTooltip>
        </TestWrapper>
      );
      expect(
        screen.getByRole('button', { name: /hover me/i })
      ).toBeInTheDocument();
    });

    it('does not show content initially', () => {
      render(
        <TestWrapper>
          <SimpleTooltip content='Tooltip text'>
            <button type='button'>Hover me</button>
          </SimpleTooltip>
        </TestWrapper>
      );
      expect(screen.queryByText('Tooltip text')).not.toBeInTheDocument();
    });

    it('opens on keyboard focus and closes on Escape', async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <TestWrapper>
          <SimpleTooltip content='Tooltip text'>
            <span>Focus me</span>
          </SimpleTooltip>
        </TestWrapper>
      );

      await user.tab();
      expect(screen.getByText('Focus me')).toHaveFocus();
      expect(await screen.findByTestId('tooltip-content')).toHaveTextContent(
        'Tooltip text'
      );

      await user.keyboard('{Escape}');
      await waitFor(() => {
        expect(screen.queryByTestId('tooltip-content')).not.toBeInTheDocument();
      });
    });
  });

  describe('Content', () => {
    it('renders string content when open', () => {
      render(
        <TestWrapper>
          <SimpleTooltip content='Simple text' defaultOpen>
            <button type='button'>Trigger</button>
          </SimpleTooltip>
        </TestWrapper>
      );

      expect(screen.getByTestId('tooltip-content')).toHaveTextContent(
        'Simple text'
      );
    });

    it('renders React node content when open', () => {
      render(
        <TestWrapper>
          <SimpleTooltip
            content={
              <span>
                <strong>Bold</strong> text
              </span>
            }
            defaultOpen
          >
            <button type='button'>Trigger</button>
          </SimpleTooltip>
        </TestWrapper>
      );

      const content = screen.getByTestId('tooltip-content');
      expect(content).toHaveTextContent('Bold');
      expect(content).toHaveTextContent('text');
    });
  });

  describe('Side Positioning', () => {
    it('defaults to top side', () => {
      render(
        <TestWrapper>
          <SimpleTooltip content='Content' defaultOpen>
            <button type='button'>Trigger</button>
          </SimpleTooltip>
        </TestWrapper>
      );

      const content = screen.getByTestId('tooltip-content');
      expect(content).toHaveAttribute('data-side', 'top');
    });

    it('supports right side', () => {
      render(
        <TestWrapper>
          <SimpleTooltip content='Content' side='right' defaultOpen>
            <button type='button'>Trigger</button>
          </SimpleTooltip>
        </TestWrapper>
      );

      const content = screen.getByTestId('tooltip-content');
      expect(content).toHaveAttribute('data-side', 'right');
    });

    it('supports bottom side', () => {
      render(
        <TestWrapper>
          <SimpleTooltip content='Content' side='bottom' defaultOpen>
            <button type='button'>Trigger</button>
          </SimpleTooltip>
        </TestWrapper>
      );

      const content = screen.getByTestId('tooltip-content');
      expect(content).toHaveAttribute('data-side', 'bottom');
    });

    it('supports left side', () => {
      render(
        <TestWrapper>
          <SimpleTooltip content='Content' side='left' defaultOpen>
            <button type='button'>Trigger</button>
          </SimpleTooltip>
        </TestWrapper>
      );

      const content = screen.getByTestId('tooltip-content');
      expect(content).toHaveAttribute('data-side', 'left');
    });
  });

  describe('Options', () => {
    it('supports custom sideOffset', () => {
      render(
        <TestWrapper>
          <SimpleTooltip content='Content' sideOffset={12} defaultOpen>
            <button type='button'>Trigger</button>
          </SimpleTooltip>
        </TestWrapper>
      );

      expect(screen.getByTestId('tooltip-content')).toBeInTheDocument();
    });

    it('supports showArrow option', () => {
      render(
        <TestWrapper>
          <SimpleTooltip content='Content' showArrow defaultOpen>
            <button type='button'>Trigger</button>
          </SimpleTooltip>
        </TestWrapper>
      );

      expect(screen.getByTestId('tooltip-arrow')).toBeInTheDocument();
    });

    it('supports custom className', () => {
      render(
        <TestWrapper>
          <SimpleTooltip content='Content' className='custom-class' defaultOpen>
            <button type='button'>Trigger</button>
          </SimpleTooltip>
        </TestWrapper>
      );

      const content = screen.getByTestId('tooltip-content');
      expect(content.className).toContain('custom-class');
    });

    it('passes compact and rich content contracts through the wrapper', () => {
      const { rerender } = render(
        <TestWrapper>
          <SimpleTooltip
            content='Compact label'
            contentVariant='compact'
            defaultOpen
          >
            <button type='button'>Trigger</button>
          </SimpleTooltip>
        </TestWrapper>
      );
      expect(screen.getByTestId('tooltip-content')).toHaveClass(
        'rounded-(--system-b-radius-overlay)',
        'whitespace-normal'
      );

      rerender(
        <TestWrapper>
          <SimpleTooltip content='Rich explanation' defaultOpen>
            <button type='button'>Trigger</button>
          </SimpleTooltip>
        </TestWrapper>
      );
      expect(screen.getByTestId('tooltip-content')).toHaveClass(
        'max-w-56',
        'break-words'
      );
    });
  });

  describe('Trigger Types', () => {
    it('works with button trigger', () => {
      render(
        <TestWrapper>
          <SimpleTooltip content='Button tooltip' defaultOpen>
            <button type='button'>Button</button>
          </SimpleTooltip>
        </TestWrapper>
      );

      expect(screen.getByTestId('tooltip-content')).toHaveTextContent(
        'Button tooltip'
      );
    });

    it('works with link trigger', () => {
      render(
        <TestWrapper>
          <SimpleTooltip content='Link tooltip' defaultOpen>
            <a href='https://example.com'>Link</a>
          </SimpleTooltip>
        </TestWrapper>
      );

      expect(screen.getByTestId('tooltip-content')).toHaveTextContent(
        'Link tooltip'
      );
    });

    it('works with span trigger', () => {
      render(
        <TestWrapper>
          <SimpleTooltip content='Span tooltip' defaultOpen>
            <span data-testid='span-trigger'>Span</span>
          </SimpleTooltip>
        </TestWrapper>
      );

      expect(screen.getByTestId('tooltip-content')).toHaveTextContent(
        'Span tooltip'
      );
      expect(screen.getByTestId('span-trigger')).toHaveAttribute(
        'tabindex',
        '0'
      );
    });

    it('preserves an explicitly configured trigger tabIndex', () => {
      render(
        <TestWrapper>
          <SimpleTooltip content='Tooltip' defaultOpen>
            <span tabIndex={-1}>Trigger</span>
          </SimpleTooltip>
        </TestWrapper>
      );

      expect(screen.getByText('Trigger')).toHaveAttribute('tabindex', '-1');
    });
  });
});

describe('SimpleTooltip accessibility', () => {
  it('has no axe violations with LTR and RTL tooltips open', async () => {
    const { container } = render(
      <TestWrapper>
        <SimpleTooltip content='Copy link' contentVariant='compact' defaultOpen>
          <button type='button'>Copy</button>
        </SimpleTooltip>
        <div dir='rtl'>
          <SimpleTooltip
            content={<span dir='rtl'>انسخ رابط الملف الشخصي العام</span>}
            defaultOpen
            showArrow
          >
            <span>نسخ الرابط</span>
          </SimpleTooltip>
        </div>
      </TestWrapper>
    );
    // A non-focusable trigger is made keyboard-reachable by the wrapper.
    expect(screen.getByText('نسخ الرابط')).toHaveAttribute('tabindex', '0');
    // Audit the triggers and each portalled tooltip layer in document.body.
    const layers = document.body.querySelectorAll(
      '[data-radix-popper-content-wrapper]'
    );
    expect(layers).toHaveLength(2);
    for (const node of [container, ...layers]) {
      await expectNoA11yViolations(node);
    }
  });
});
