import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PriorityGlyph } from './PriorityGlyph';

describe('PriorityGlyph', () => {
  it('renders an aria-hidden spacer for none', () => {
    const { container } = render(<PriorityGlyph priority='none' />);
    expect(
      (container.firstElementChild as HTMLElement).getAttribute('aria-hidden')
    ).toBe('true');
  });

  it('renders the urgent pill with a !', () => {
    const { container } = render(<PriorityGlyph priority='urgent' />);
    expect(container.textContent).toBe('!');
  });

  it('renders three bars (with low coloring 1) for low priority', () => {
    const { container } = render(<PriorityGlyph priority='low' />);
    // 3 bar spans
    const bars = container.querySelectorAll('span > span');
    expect(bars.length).toBe(3);
  });

  it('renders the medium-priority title', () => {
    const { container } = render(<PriorityGlyph priority='medium' />);
    expect(container.firstElementChild?.getAttribute('title')).toBe(
      'Priority: medium'
    );
  });

  it('keeps every level axe-clean', async () => {
    for (const priority of [
      'none',
      'low',
      'medium',
      'high',
      'urgent',
    ] as const) {
      const { container, unmount } = render(
        <PriorityGlyph priority={priority} />
      );
      await expectNoA11yViolations(container);
      unmount();
    }
  });

  it('uses the error token for the urgent pill', () => {
    const { container } = render(<PriorityGlyph priority='urgent' />);
    expect(container.firstElementChild).toHaveClass('text-error');
  });
});
