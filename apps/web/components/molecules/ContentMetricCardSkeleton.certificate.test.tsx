import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ContentMetricCardSkeleton } from './ContentMetricCardSkeleton';

describe('ContentMetricCardSkeleton certificate', () => {
  it('hides the default placeholder from assistive tech with every line', async () => {
    const { container } = render(
      <ContentMetricCardSkeleton className='w-56' />
    );

    const card = container.firstElementChild as HTMLElement;
    expect(card).toHaveAttribute('aria-hidden', 'true');
    expect(card).toHaveClass('w-56');
    expect(card.querySelectorAll('.h-lh')).toHaveLength(3);
    await expectNoA11yViolations(container);
  });

  it('drops the icon and subtitle lines when asked', async () => {
    const { container } = render(
      <ContentMetricCardSkeleton showIcon={false} showSubtitle={false} />
    );

    const card = container.firstElementChild as HTMLElement;
    expect(card.querySelectorAll('.h-lh')).toHaveLength(2);
    expect(card.querySelector('.size-3\\.5')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('matches the inline and stacked chip layouts', async () => {
    const { container } = render(
      <div>
        <ContentMetricCardSkeleton
          layout='icon-chip-inline'
          showSubtitle={false}
        />
        <ContentMetricCardSkeleton
          layout='icon-chip'
          density='compact'
          subtitleWidth='w-32'
        />
      </div>
    );

    const [inline, stacked] = Array.from(
      container.querySelectorAll('[aria-hidden="true"]')
    ).filter(node => node.parentElement === container.firstElementChild);
    expect(inline).toHaveClass('flex', 'items-center');
    expect(stacked).toHaveClass('p-3');
    expect(stacked.querySelector('.w-32')).not.toBeNull();
    await expectNoA11yViolations(container);
  });
});
