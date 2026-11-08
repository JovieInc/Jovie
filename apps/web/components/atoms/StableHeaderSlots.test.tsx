import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  StableHeaderChipRail,
  StableHeaderTextSlot,
} from './StableHeaderSlots';

describe('StableHeaderTextSlot', () => {
  it('renders nothing without content unless space is reserved', () => {
    const { container, rerender } = render(<StableHeaderTextSlot />);
    expect(container).toBeEmptyDOMElement();

    rerender(<StableHeaderTextSlot reserve lineCount={2} testId='slot' />);
    const slot = screen.getByTestId('slot');
    expect(slot).toHaveAttribute('aria-hidden', 'true');
    expect(slot).toHaveClass('invisible', 'min-h-8', 'line-clamp-2');
  });

  it('shows content without hiding it from assistive tech', () => {
    render(
      <StableHeaderTextSlot lineCount={1} size='md' testId='slot'>
        Subtitle
      </StableHeaderTextSlot>
    );
    const slot = screen.getByTestId('slot');
    expect(slot).toHaveTextContent('Subtitle');
    expect(slot).not.toHaveAttribute('aria-hidden');
    expect(slot).toHaveClass('min-h-6', 'truncate');
  });
});

describe('StableHeaderChipRail', () => {
  it('makes a populated scrollable chip rail keyboard focusable', () => {
    render(
      <StableHeaderChipRail testId='rail'>
        <span>Live</span>
      </StableHeaderChipRail>
    );
    const scroller = screen.getByText('Live').parentElement as HTMLElement;
    expect(scroller).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('rail')).not.toHaveAttribute('aria-hidden');
  });

  it('keeps a reserved empty rail hidden and out of the tab order', () => {
    render(<StableHeaderChipRail reserve testId='rail' />);
    const rail = screen.getByTestId('rail');
    expect(rail).toHaveAttribute('aria-hidden', 'true');
    expect(rail).toHaveClass('invisible');
    expect(rail.querySelector('[tabindex]')).toBeNull();
  });
});
