import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
});
