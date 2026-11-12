import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TableColumnCompacts } from './TableColumnCompacts';

describe('TableColumnCompacts', () => {
  it('renders nothing when every folded column is empty', async () => {
    const { container } = render(<TableColumnCompacts items={[]} />);
    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('joins present compact forms on one line', async () => {
    const { container } = render(
      <TableColumnCompacts
        items={[
          { id: 'state', node: 'Active' },
          { id: 'last', node: '2h' },
        ]}
      />
    );

    const cluster = screen.getByTestId('table-column-compacts');
    expect(cluster).toHaveTextContent('Active');
    expect(cluster).toHaveTextContent('2h');
    expect(cluster).toHaveTextContent('·');
    await expectNoA11yViolations(container);
  });

  it('hides the separators from assistive tech and keeps long values whole', async () => {
    const { container } = render(
      <TableColumnCompacts
        items={[
          { id: 'state', node: 'Awaiting distributor approval' },
          { id: 'last', node: 'Updated 3 weeks ago' },
          { id: 'alerts', node: 'SMS, email and push' },
        ]}
      />
    );

    const cluster = screen.getByTestId('table-column-compacts');
    expect(cluster).toHaveClass('shrink-0', 'items-center');
    expect(cluster.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
    expect(cluster).toHaveTextContent('Awaiting distributor approval');
    await expectNoA11yViolations(container);
  });

  it('folds columns in a right-to-left table', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <TableColumnCompacts
          items={[
            { id: 'state', node: 'نشط' },
            { id: 'last', node: 'منذ ساعتين' },
          ]}
        />
      </div>
    );

    expect(screen.getByTestId('table-column-compacts')).toHaveTextContent(
      'منذ ساعتين'
    );
    await expectNoA11yViolations(container);
  });
});
