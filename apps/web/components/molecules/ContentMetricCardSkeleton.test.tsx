import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ContentMetricCardSkeleton } from './ContentMetricCardSkeleton';

it('reserves subtitle space by default and can match metrics without subtitles', () => {
  const { container, rerender } = render(
    <ContentMetricCardSkeleton showIcon={false} />
  );
  expect(container.querySelectorAll('.skeleton')).toHaveLength(3);
  expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  rerender(<ContentMetricCardSkeleton showIcon={false} showSubtitle={false} />);
  expect(container.querySelectorAll('.skeleton')).toHaveLength(2);
  expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
});
