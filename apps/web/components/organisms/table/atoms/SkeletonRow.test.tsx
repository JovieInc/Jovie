import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SkeletonRow } from './SkeletonRow';

describe('SkeletonRow', () => {
  it('reserves the row height and applies a schema column class', () => {
    const { container } = render(
      <table>
        <tbody>
          <SkeletonRow
            columns={2}
            height='32px'
            columnConfig={[
              { variant: 'text', className: 'schema-name-col' },
              { variant: 'text' },
            ]}
          />
        </tbody>
      </table>
    );

    const row = container.querySelector('tr');
    const [nameCell, otherCell] = container.querySelectorAll('td');
    expect(row).toHaveStyle({ height: '32px' });
    expect(nameCell).toHaveClass('schema-name-col');
    expect(otherCell).not.toHaveClass('schema-name-col');
  });

  it('falls back to text placeholders for columns without config', () => {
    const { container } = render(
      <table>
        <tbody>
          <SkeletonRow columns={3} columnConfig={[{ variant: 'person' }]} />
        </tbody>
      </table>
    );

    const cells = container.querySelectorAll('td');
    expect(cells).toHaveLength(3);
    expect(
      cells[0].querySelector('.system-b-table-skeleton-person-face')
    ).not.toBeNull();
    expect(
      cells[1].querySelector('.system-b-table-skeleton-person-face')
    ).toBeNull();
    expect(cells[2].querySelector('[data-slot="skeleton"]')).not.toBeNull();
  });

  it.each([
    ['ltr', undefined],
    ['rtl', 'rtl'],
  ] as const)('has no accessibility violations in %s', async (_name, dir) => {
    const { container } = render(
      <table dir={dir} lang={dir === 'rtl' ? 'ar' : 'en'}>
        <caption>Loading audience</caption>
        <tbody>
          <SkeletonRow
            columns={3}
            columnConfig={[
              { variant: 'person' },
              { variant: 'badge' },
              { variant: 'text' },
            ]}
          />
        </tbody>
      </table>
    );
    await expectNoA11yViolations(container);
  });
});
