import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OpportunityRow } from './OpportunityRow';

describe('OpportunityRow', () => {
  const baseProps = {
    id: 'row-1',
    state: 'new' as const,
    title: 'Detroit listeners up 340% — book a show',
    metadata: 'Magic Stick · Mar 15 · 92% match · $2,000 fee',
    onPrimaryAction: vi.fn(),
    onDismiss: vi.fn(),
  };

  it('renders title and metadata', () => {
    render(<OpportunityRow {...baseProps} />);
    expect(
      screen.getByText('Detroit listeners up 340% — book a show')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Magic Stick · Mar 15 · 92% match · $2,000 fee')
    ).toBeInTheDocument();
  });

  it('renders a status dot', () => {
    render(<OpportunityRow {...baseProps} />);
    const dot = document.querySelector('[aria-hidden="true"]');
    expect(dot).toBeInTheDocument();
  });

  it('hides action chrome by default (resting state) via invisible wrapper', () => {
    render(<OpportunityRow {...baseProps} />);
    const btn = screen.getByLabelText('Plan opportunity');
    const wrapper = btn.parentElement;
    expect(wrapper).toHaveClass('opacity-0');
    expect(wrapper).toHaveClass('pointer-events-none');
  });

  it('fires primary action on plan button click', () => {
    const onPrimaryAction = vi.fn();
    render(<OpportunityRow {...{ ...baseProps, onPrimaryAction }} />);
    const btn = screen.getByLabelText('Plan opportunity');
    fireEvent.click(btn);
    expect(onPrimaryAction).toHaveBeenCalledWith('row-1');
  });

  it('fires dismiss on x click', () => {
    const onDismiss = vi.fn();
    render(<OpportunityRow {...{ ...baseProps, onDismiss }} />);
    const btn = screen.getByLabelText('Dismiss Opportunity');
    fireEvent.click(btn);
    expect(onDismiss).toHaveBeenCalledWith('row-1');
  });

  it('shows checkmark for accepted state', () => {
    render(<OpportunityRow {...{ ...baseProps, state: 'accepted' }} />);
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('hides dismiss button for accepted state', () => {
    render(<OpportunityRow {...{ ...baseProps, state: 'accepted' }} />);
    expect(
      screen.queryByLabelText('Dismiss Opportunity')
    ).not.toBeInTheDocument();
  });

  it('renders no action chrome for rejected state', () => {
    render(<OpportunityRow {...{ ...baseProps, state: 'rejected' }} />);
    expect(screen.queryByLabelText('Plan opportunity')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Dismiss Opportunity')
    ).not.toBeInTheDocument();
  });

  it('renders no action chrome for reported state', () => {
    render(<OpportunityRow {...{ ...baseProps, state: 'reported' }} />);
    expect(screen.queryByLabelText('Plan opportunity')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Dismiss Opportunity')
    ).not.toBeInTheDocument();
  });

  it('renders arrow for in-progress state', () => {
    render(<OpportunityRow {...{ ...baseProps, state: 'in-progress' }} />);
    expect(screen.getByText('→')).toBeInTheDocument();
  });

  it('supports hiding the dot', () => {
    const { container } = render(
      <OpportunityRow {...{ ...baseProps, hideDot: true }} />
    );
    // When hideDot is true, the dot circle is replaced by a plain
    // spacer span with no background-color style attribute at all.
    // Find all aria-hidden spans and verify none has a background-color.
    const ariaHiddenSpans = container.querySelectorAll(
      'span[aria-hidden="true"]'
    );
    let dotFound = false;
    for (const span of ariaHiddenSpans) {
      const style = span.getAttribute('style');
      if (style && style.includes('background-color')) {
        dotFound = true;
      }
    }
    expect(dotFound).toBe(false);
  });
});
