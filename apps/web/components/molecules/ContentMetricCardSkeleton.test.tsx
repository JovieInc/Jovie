import { render, within } from '@testing-library/react';
import { Eye } from 'lucide-react';
import { expect, it } from 'vitest';
import { ContentMetricCard } from './ContentMetricCard';
import { ContentMetricCardSkeleton } from './ContentMetricCardSkeleton';

it.each([
  { showIcon: false, showSubtitle: false },
  { showIcon: true, showSubtitle: false },
  { showIcon: false, showSubtitle: true },
  { showIcon: true, showSubtitle: true },
])('reserves the default loaded frame and text line boxes for %j', options => {
  const { container } = render(
    <>
      <ContentMetricCard
        label='Streams'
        value='128.4k'
        icon={options.showIcon ? Eye : undefined}
        subtitle={options.showSubtitle ? 'Last 28 days' : undefined}
      />
      <ContentMetricCardSkeleton {...options} />
    </>
  );
  const [loaded, loading] = Array.from(container.children);
  expect(loaded).toHaveClass('p-4');
  expect(loading.className).toBe(loaded.className);
  expect(loading).toHaveAttribute('aria-hidden', 'true');
  const placeholders = Array.from(loading.querySelectorAll('.skeleton'));
  const content = within(loaded as HTMLElement);
  const text = [content.getByText('Streams'), content.getByText('128.4k')];
  if (options.showSubtitle) text.push(content.getByText('Last 28 days'));
  const textPlaceholders = placeholders.slice(options.showIcon ? 1 : 0);
  expect(textPlaceholders).toHaveLength(text.length);
  for (const [index, element] of text.entries()) {
    expect(textPlaceholders[index].parentElement).toHaveClass(
      ...element.classList,
      'h-lh'
    );
    expect(textPlaceholders[index]).toHaveClass('size-full');
  }
});

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
