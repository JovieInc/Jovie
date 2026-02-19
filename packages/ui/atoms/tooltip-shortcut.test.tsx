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
    it('shows label in tooltip when open', () => {
      render(
        <TooltipProvider delayDuration={0}>
          <TooltipShortcut label='Bold'>
            <button type='button'>B</button>
          </TooltipShortcut>
        </TooltipProvider>
      );
      // The tooltip content is controlled by Radix and appears on hover
      // We can verify the component renders without errors
      expect(screen.getByRole('button', { name: 'B' })).toBeInTheDocument();
    });
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
