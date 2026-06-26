import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ScrollToBottom } from './ScrollToBottom';

// motion/react animations don't run in jsdom. Render elements immediately
// so accessibility queries and style assertions work without waiting for
// animation frames.
vi.mock('motion/react', async () => {
  const actual =
    await vi.importActual<typeof import('motion/react')>('motion/react');
  return {
    ...actual,
    // AnimatePresence: render children always (no exit animation gating)
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    // motion.button: plain <button> passthrough so aria/role queries work
    motion: {
      button: ({
        children,
        className,
        type,
        onClick,
        'aria-label': ariaLabel,
      }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
        'aria-label'?: string;
      }) => (
        <button
          type={type}
          className={className}
          onClick={onClick}
          aria-label={ariaLabel}
        >
          {children}
        </button>
      ),
    },
  };
});

describe('ScrollToBottom', () => {
  it('renders a circular icon-only button with aria-label when visible', () => {
    render(<ScrollToBottom visible onClick={vi.fn()} />);

    const button = screen.getByRole('button', {
      name: 'Scroll To Latest Messages',
    });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('system-b-scroll-to-bottom');
    // aria-label is the only accessible name — icon-only design
    expect(button).toHaveAttribute('aria-label', 'Scroll To Latest Messages');
  });

  it('renders no visible text — icon-only', () => {
    render(<ScrollToBottom visible onClick={vi.fn()} />);

    const button = screen.getByRole('button', {
      name: 'Scroll To Latest Messages',
    });
    // textContent must be empty (only SVG children, no bare text)
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
