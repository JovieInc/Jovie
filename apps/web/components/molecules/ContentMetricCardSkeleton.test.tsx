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

it('reserves the compact chip header and value geometry used by earnings', () => {
  const { container, rerender } = render(
    <ContentMetricCardSkeleton
      layout='icon-chip'
      density='compact'
      showSubtitle={false}
    />
  );
  expect(container.firstElementChild).toHaveClass('p-3');
  expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  expect(container.querySelectorAll('.skeleton')).toHaveLength(3);
  expect(container.querySelector('.h-7.w-7')).toBeInTheDocument();
  expect(
    container.querySelector('.h-lh.text-2xl .h-full.w-20')
  ).toBeInTheDocument();

  rerender(<ContentMetricCardSkeleton layout='icon-chip' />);
  expect(container.querySelectorAll('.skeleton')).toHaveLength(4);
  expect(container.firstElementChild).toHaveClass('p-4');

  rerender(
    <ContentMetricCardSkeleton layout='icon-chip-inline' showIcon={false} />
  );
  expect(container.querySelectorAll('.skeleton')).toHaveLength(3);
  expect(container.querySelector('.h-8.w-8')).toBeNull();
});
