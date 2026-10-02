import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TableColumnCompacts } from './TableColumnCompacts';

describe('TableColumnCompacts', () => {
  it('renders nothing when every folded column is empty', () => {
    const { container } = render(<TableColumnCompacts items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('joins present compact forms on one line', () => {
    render(
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
  });
});
