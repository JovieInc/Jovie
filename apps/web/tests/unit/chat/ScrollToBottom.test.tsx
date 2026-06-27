import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ScrollToBottom } from '@/components/jovie/components/ScrollToBottom';

// motion/react animations don't run in jsdom. Render elements immediately
// so accessibility queries and style assertions work without waiting for
// animation frames.
vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    button: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...props
    }: ComponentProps<'button'> & {
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
    }) => <button {...props}>{children}</button>,
  },
  useReducedMotion: () => false,
}));

describe('ScrollToBottom', () => {
  it('renders a circular icon-only button with aria-label when visible', () => {
    render(<ScrollToBottom visible onClick={vi.fn()} />);

    const button = screen.getByRole('button', {
      name: 'Scroll To Latest Messages',
    });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('system-b-scroll-to-bottom');
    expect(button).toHaveAttribute('aria-label', 'Scroll To Latest Messages');
  });

  it('renders no visible text — icon-only', () => {
    render(<ScrollToBottom visible onClick={vi.fn()} />);

    const button = screen.getByRole('button', {
      name: 'Scroll To Latest Messages',
    });
    expect(button.textContent?.trim()).toBe('');
  });

  it('does not render a button when not visible', () => {
    render(<ScrollToBottom visible={false} onClick={vi.fn()} />);

    expect(
      screen.queryByRole('button', { name: 'Scroll To Latest Messages' })
    ).not.toBeInTheDocument();
  });

  it('calls onClick when the button is clicked', () => {
    const onClick = vi.fn();
    render(<ScrollToBottom visible onClick={onClick} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Scroll To Latest Messages' })
    );

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
