import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { LyricsRouteSkeleton } from './LyricsRouteSkeleton';

describe('LyricsRouteSkeleton', () => {
  it('announces a busy lyrics region with fixed placeholder geometry', async () => {
    const { container } = render(<LyricsRouteSkeleton />);

    const region = screen.getByRole('region', { name: 'Loading lyrics' });
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region.querySelector('header')).toHaveClass('h-16', 'shrink-0');
    expect(region.querySelector('footer')).toHaveClass('h-14', 'shrink-0');
    expect(
      Array.from(
        region.querySelectorAll<HTMLElement>('.space-y-5 > .skeleton'),
        line => line.style.width
      )
    ).toEqual(['92%', '76%', '88%', '64%', '84%', '72%']);
    await expectNoA11yViolations(container);
  });

  it('keeps the same structure in a right-to-left layout', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <LyricsRouteSkeleton />
      </div>
    );

    expect(
      screen.getByRole('region', { name: 'Loading lyrics' })
    ).toBeInTheDocument();
    expect(container.querySelectorAll('.skeleton')).toHaveLength(12);
    await expectNoA11yViolations(container);
  });
});
