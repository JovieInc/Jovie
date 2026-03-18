import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';

import { Kbd } from './kbd';

describe('Kbd', () => {
  describe('Basic Rendering', () => {
    it('renders as span element', () => {
      render(<Kbd data-testid='kbd'>⌘K</Kbd>);
      const kbd = screen.getByTestId('kbd');
      expect(kbd.tagName).toBe('SPAN');
    });

    it('renders text content', () => {
      render(<Kbd>⌘K</Kbd>);
      expect(screen.getByText('⌘K')).toBeInTheDocument();
    });

    it('forwards refs correctly', () => {
      const ref = React.createRef<HTMLSpanElement>();
      render(<Kbd ref={ref}>⌘K</Kbd>);
      expect(ref.current).toBeInstanceOf(HTMLSpanElement);
    });

    it('has correct displayName', () => {
      expect(Kbd.displayName).toBe('Kbd');
    });
  });

  describe('Variants', () => {
    it('applies default variant by default', () => {
      render(<Kbd data-testid='kbd'>⌘K</Kbd>);
      const kbd = screen.getByTestId('kbd');
      expect(kbd.className).toContain('bg-(--linear-bg-surface-1)');
      expect(kbd.className).toContain('border-(--linear-border-default)');
      expect(kbd.className).toContain('text-(--linear-text-secondary)');
    });

    it('applies tooltip variant', () => {
      render(
        <Kbd variant='tooltip' data-testid='kbd'>
          ⌘K
        </Kbd>
      );
      const kbd = screen.getByTestId('kbd');
      expect(kbd.className).toContain('bg-(--linear-bg-surface-1)');
      expect(kbd.className).toContain('border-(--linear-border-default)');
      expect(kbd.className).toContain('text-(--linear-text-primary)');
    });

    it('tooltip variant has dark mode styles', () => {
      render(
        <Kbd variant='tooltip' data-testid='kbd'>
          ⌘K
        </Kbd>
      );
      const kbd = screen.getByTestId('kbd');
      expect(kbd.className).toContain('bg-(--linear-bg-surface-1)');
      expect(kbd.className).toContain('border-(--linear-border-default)');
    });
  });

  describe('Styling', () => {
    it('applies base styling classes', () => {
      render(<Kbd data-testid='kbd'>K</Kbd>);
      const kbd = screen.getByTestId('kbd');
      expect(kbd.className).toContain('inline-flex');
      expect(kbd.className).toContain('items-center');
      expect(kbd.className).toContain('justify-center');
      expect(kbd.className).toContain('rounded-(--linear-app-radius-item)');
      expect(kbd.className).toContain('px-1');
      expect(kbd.className).toContain('py-px');
      expect(kbd.className).toContain('leading-none');
      expect(kbd.className).toContain('font-mono');
      expect(kbd.className).toContain('text-[11px]');
      expect(kbd.className).toContain('font-[400]');
    });

    it('merges custom className', () => {
      render(
        <Kbd className='custom-class' data-testid='kbd'>
          K
        </Kbd>
      );
      const kbd = screen.getByTestId('kbd');
      expect(kbd.className).toContain('custom-class');
      expect(kbd.className).toContain('rounded-(--linear-app-radius-item)');
    });
  });

  describe('HTML Attributes', () => {
    it('passes through HTML attributes', () => {
      render(
        <Kbd id='custom-id' title='Keyboard shortcut' data-testid='kbd'>
          K
        </Kbd>
      );
      const kbd = screen.getByTestId('kbd');
      expect(kbd).toHaveAttribute('id', 'custom-id');
      expect(kbd).toHaveAttribute('title', 'Keyboard shortcut');
    });
  });

  describe('Content', () => {
    it('renders single key', () => {
      render(<Kbd>K</Kbd>);
      expect(screen.getByText('K')).toBeInTheDocument();
    });

    it('renders modifier key combination', () => {
      render(<Kbd>⌘K</Kbd>);
      expect(screen.getByText('⌘K')).toBeInTheDocument();
    });

    it('renders complex key combinations', () => {
      render(<Kbd>Ctrl+Shift+P</Kbd>);
      expect(screen.getByText('Ctrl+Shift+P')).toBeInTheDocument();
    });

    it('renders special keys', () => {
      render(<Kbd>↵</Kbd>);
      expect(screen.getByText('↵')).toBeInTheDocument();
    });

    it('renders multiple keys in sequence', () => {
      render(
        <span>
          <Kbd>⌘</Kbd> + <Kbd>K</Kbd>
        </span>
      );
      expect(screen.getByText('⌘')).toBeInTheDocument();
      expect(screen.getByText('K')).toBeInTheDocument();
    });
  });

  describe('Usage in Tooltip', () => {
    it('works with tooltip variant for proper contrast', () => {
      render(
        <div className='bg-gray-900'>
          <Kbd variant='tooltip'>⌘K</Kbd>
        </div>
      );
      const kbd = screen.getByText('⌘K');
      expect(kbd.className).toContain('text-(--linear-text-primary)');
    });
  });
});
