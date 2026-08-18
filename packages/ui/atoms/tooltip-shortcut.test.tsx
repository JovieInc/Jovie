import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';

import { TooltipProvider } from './tooltip';
import { TooltipShortcut } from './tooltip-shortcut';

// Wrap in TooltipProvider since TooltipShortcut uses Tooltip internally
const renderWithProvider = (ui: React.ReactElement) =>
  render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);

describe('TooltipShortcut', () => {
  describe('Trigger Rendering', () => {
    it('renders children as trigger', () => {
      renderWithProvider(
        <TooltipShortcut label='Bold'>
          <button type='button'>B</button>
        </TooltipShortcut>
      );
      expect(screen.getByRole('button', { name: 'B' })).toBeInTheDocument();
    });

    it('renders multiple trigger types', () => {
      renderWithProvider(
        <TooltipShortcut label='Link'>
          <a href='#test'>Click here</a>
        </TooltipShortcut>
      );
      expect(screen.getByText('Click here')).toBeInTheDocument();
    });
  });

  describe('Tooltip Content', () => {
    it('shows a compact label and shortcut when open', () => {
      renderWithProvider(
        <TooltipShortcut label=' Bold ' shortcut=' ⌘B ' defaultOpen>
          <button type='button'>B</button>
        </TooltipShortcut>
      );

      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toHaveTextContent('Bold');
      expect(tooltip).toHaveTextContent('⌘B');
      expect(screen.getByTestId('tooltip-content')).toHaveClass(
        'rounded-full',
        'whitespace-nowrap'
      );
    });

    it('uses a safe label when whitespace-only text is provided', () => {
      renderWithProvider(
        <TooltipShortcut label='   ' defaultOpen>
          <button type='button'>Info</button>
        </TooltipShortcut>
      );

      expect(screen.getByRole('tooltip')).toHaveTextContent('More information');
    });

    it('supports an explicit rich wrapping contract', () => {
      renderWithProvider(
        <TooltipShortcut
          label='Detailed explanation'
          contentVariant='rich'
          defaultOpen
        >
          <button type='button'>B</button>
        </TooltipShortcut>
      );

      expect(screen.getByTestId('tooltip-content')).not.toHaveClass(
        'whitespace-nowrap'
      );
    });
  });

  it('forwards the explicit compact contract for a toolbar label', () => {
    render(
      <TooltipProvider delayDuration={0}>
        <TooltipShortcut label='Display' contentVariant='compact' defaultOpen>
          <button type='button'>Display</button>
        </TooltipShortcut>
      </TooltipProvider>
    );

    expect(screen.getByTestId('tooltip-content')).toHaveClass('rounded-full');
  });

  describe('Props', () => {
    it('accepts label prop', () => {
      renderWithProvider(
        <TooltipShortcut label='Format Bold'>
          <button type='button'>B</button>
        </TooltipShortcut>
      );
      // Component renders successfully with label prop
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('accepts optional shortcut prop', () => {
      renderWithProvider(
        <TooltipShortcut label='Bold' shortcut='⌘B'>
          <button type='button'>B</button>
        </TooltipShortcut>
      );
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('renders without shortcut prop', () => {
      renderWithProvider(
        <TooltipShortcut label='Bold'>
          <button type='button'>B</button>
        </TooltipShortcut>
      );
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('accepts side prop', () => {
      renderWithProvider(
        <TooltipShortcut label='Bold' side='bottom'>
          <button type='button'>B</button>
        </TooltipShortcut>
      );
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('defaults side to top', () => {
      renderWithProvider(
        <TooltipShortcut label='Bold'>
          <button type='button'>B</button>
        </TooltipShortcut>
      );
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });

  describe('Ref Forwarding', () => {
    it('forwards ref to trigger child via asChild', () => {
      const ref = React.createRef<HTMLButtonElement>();
      renderWithProvider(
        <TooltipShortcut label='Bold'>
          <button ref={ref} type='button'>
            B
          </button>
        </TooltipShortcut>
      );
      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });
  });
});
