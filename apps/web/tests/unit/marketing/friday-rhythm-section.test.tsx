import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HTMLAttributes, ReactNode, SVGProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FridayRhythmSection } from '@/components/marketing/friday-rhythm-section';

vi.mock('motion/react', () => ({
  motion: {
    div: ({
      children,
      animate: _animate,
      initial: _initial,
      transition: _transition,
      ...props
    }: HTMLAttributes<HTMLDivElement> & {
      animate?: unknown;
      initial?: unknown;
      transition?: unknown;
      children?: ReactNode;
    }) => <div {...props}>{children}</div>,
    path: ({
      animate: _animate,
      initial: _initial,
      transition: _transition,
      ...props
    }: SVGProps<SVGPathElement> & {
      animate?: unknown;
      initial?: unknown;
      transition?: unknown;
    }) => <path {...props} />,
  },
  useReducedMotion: () => false,
}));

describe('FridayRhythmSection', () => {
  it('renders the model framing and secondary CTA', () => {
    render(<FridayRhythmSection />);

    expect(
      screen.getAllByRole('heading', { name: 'Make Every Friday Count.' })
    ).toHaveLength(2);
    expect(
      screen.getAllByRole('img', {
        name: /Jovie rhythm model showing 3 of 52 Fridays active/i,
      })
    ).not.toHaveLength(0);
    expect(
      screen.getAllByRole('link', { name: 'Build Your Weekly Rhythm' }).at(0)
    ).toHaveAttribute('href', '/signup');
    expect(screen.queryByText('Less')).not.toBeInTheDocument();
    expect(screen.queryByText('More')).not.toBeInTheDocument();
  });

  it('uses accessible mobile segmented controls', async () => {
    const user = userEvent.setup();

    render(<FridayRhythmSection />);

    const beforeButtons = screen.getAllByRole('button', {
      name: 'Before Jovie',
    });
    const withButtons = screen.getAllByRole('button', { name: 'With Jovie' });

    expect(beforeButtons[0]).toHaveAttribute('aria-pressed', 'true');
    expect(withButtons[0]).toHaveAttribute('aria-pressed', 'false');

    await user.click(withButtons[0]);

    expect(beforeButtons[0]).toHaveAttribute('aria-pressed', 'false');
    expect(withButtons[0]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByText('52 Fridays.')).not.toHaveLength(0);
  });
});
