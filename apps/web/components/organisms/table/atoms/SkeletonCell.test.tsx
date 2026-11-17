import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SkeletonCell } from './SkeletonCell';

const skeletons = (container: HTMLElement) =>
  container.querySelectorAll('[data-slot="skeleton"]');

describe('SkeletonCell', () => {
  it('draws one text bar by default at the reserved width', () => {
    const { container } = render(<SkeletonCell width='120px' />);

    expect(container.firstElementChild).toHaveStyle({ width: '120px' });
    expect(skeletons(container)).toHaveLength(1);
    expect(skeletons(container)[0]).toHaveClass('h-4', 'w-24');
  });

  it.each([
    ['avatar', 'h-8'],
    ['badge', 'h-5'],
    ['button', 'h-8'],
  ] as const)('sizes the %s placeholder', (variant, height) => {
    const { container } = render(<SkeletonCell variant={variant} />);

    expect(skeletons(container)).toHaveLength(1);
    expect(skeletons(container)[0]).toHaveClass(height);
  });

  it('draws an icon, title and meta line for a release', () => {
    const { container } = render(
      <SkeletonCell variant='release' width='240px' />
    );

    expect(skeletons(container)).toHaveLength(3);
    expect(
      container.querySelector('.system-b-table-skeleton-release-title')
    ).not.toBeNull();
    expect(
      container.querySelector('.system-b-table-skeleton-release-meta')
    ).not.toBeNull();
    expect(container.firstElementChild).toHaveStyle({ width: '240px' });
  });

  it('draws the three-part meta grid', () => {
    const { container } = render(
      <SkeletonCell variant='meta' className='schema-meta-col' />
    );

    expect(skeletons(container)).toHaveLength(3);
    expect(container.firstElementChild).toHaveClass(
      'system-b-table-skeleton-meta-grid',
      'schema-meta-col'
    );
  });

  it.each([
    ['text', undefined],
    ['release', undefined],
    ['meta', 'rtl'],
  ] as const)(
    'has no accessibility violations for %s',
    async (variant, dir) => {
      const { container } = render(
        <div dir={dir} lang={dir === 'rtl' ? 'ar' : 'en'}>
          <SkeletonCell variant={variant} width='160px' />
        </div>
      );
      await expectNoA11yViolations(container);
    }
  );
});
