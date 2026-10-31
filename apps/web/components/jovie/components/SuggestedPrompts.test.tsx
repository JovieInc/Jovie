import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SuggestedPrompts } from './SuggestedPrompts';

describe('SuggestedPrompts', () => {
  it('uses the banned-icon-safe Layers glyph for the Plan a Release suggestion', () => {
    render(<SuggestedPrompts onSelect={vi.fn()} />);

    const planRelease = screen.getByRole('button', {
      name: 'Plan a Release',
    });
    const icon = planRelease.querySelector('svg');
    expect(icon).toHaveClass('lucide-layers');
    expect(icon).not.toHaveClass('lucide-disc-3');
  });

  it('renders the feedback suggestion alongside the default prompts', () => {
    render(<SuggestedPrompts onSelect={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Plan a Release' })
    ).toBeInTheDocument();
  });

  it('hides release and album art chips for a comedian (JOV-9679)', () => {
    render(<SuggestedPrompts onSelect={vi.fn()} segment='comedian' />);

    expect(
      screen.queryByRole('button', { name: 'Plan a Release' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Generate Album Art' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Review Signals' })
    ).toBeInTheDocument();
  });

  it('keeps release chips for a musician (JOV-9679)', () => {
    render(<SuggestedPrompts onSelect={vi.fn()} segment='musician' />);

    expect(
      screen.getByRole('button', { name: 'Plan a Release' })
    ).toBeInTheDocument();
  });
});
