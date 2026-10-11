import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ColumnCompactProvider,
  usePrimaryColumnCompacts,
} from './column-priority-context';

function PrimaryCell({ row }: { readonly row: { readonly name: string } }) {
  const { primaryId, node } = usePrimaryColumnCompacts(row);
  return (
    <div>
      <span>{primaryId}</span>
      <span>{row.name}</span>
      {node}
    </div>
  );
}

describe('ColumnCompactProvider', () => {
  it('drops blank compact forms and keeps the rest in the primary cell', () => {
    render(
      <ColumnCompactProvider
        value={{
          primaryId: 'fan',
          items: [
            { id: 'state', render: () => 'Active' },
            { id: 'alerts', render: () => '   ' },
            { id: 'last', render: () => null },
          ],
        }}
      >
        <PrimaryCell row={{ name: 'Avery Chen' }} />
      </ColumnCompactProvider>
    );

    expect(screen.getByText('fan')).toBeInTheDocument();
    expect(screen.getByText('Avery Chen')).toBeInTheDocument();
    expect(screen.getByTestId('table-column-compacts')).toHaveTextContent(
      'Active'
    );
    expect(screen.getByTestId('table-column-compacts')).not.toHaveTextContent(
      '·'
    );
  });
});
