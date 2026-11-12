import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  type ColumnCompactItem,
  ColumnCompactProvider,
  usePrimaryColumnCompacts,
} from './column-priority-context';

const ACTIVE_ITEMS: readonly ColumnCompactItem[] = [
  { id: 'state', render: () => 'Active' },
];
const ARABIC_ITEMS: readonly ColumnCompactItem[] = [
  { id: 'state', render: () => 'نشط' },
];

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

  it('renders no compact strip when every column is visible', () => {
    render(
      <ColumnCompactProvider value={{ primaryId: 'fan', items: [] }}>
        <PrimaryCell row={{ name: 'Avery Chen' }} />
      </ColumnCompactProvider>
    );

    expect(screen.getByText('Avery Chen')).toBeInTheDocument();
    expect(screen.queryByTestId('table-column-compacts')).toBeNull();
  });

  it('passes each row to the hidden columns it folds in', () => {
    render(
      <ColumnCompactProvider
        value={{
          primaryId: 'fan',
          items: [
            {
              id: 'city',
              render: ((row: { city: string }) => row.city) as never,
            },
          ],
        }}
      >
        <CityCell row={{ name: 'Avery Chen', city: 'Lagos' }} />
      </ColumnCompactProvider>
    );

    expect(screen.getByTestId('table-column-compacts')).toHaveTextContent(
      'Lagos'
    );
  });

  it.each([
    ['folded', ACTIVE_ITEMS, 'Avery Chen', 'ltr'],
    ['empty', [], 'Avery Chen', 'ltr'],
    ['rtl', ARABIC_ITEMS, 'ليلى حداد', 'rtl'],
  ] as const)(
    'has no accessibility violations when %s',
    async (_name, items, name, dir) => {
      const { container } = render(
        <div dir={dir}>
          <ColumnCompactProvider value={{ primaryId: 'fan', items }}>
            <PrimaryCell row={{ name }} />
          </ColumnCompactProvider>
        </div>
      );
      await expectNoA11yViolations(container);
    }
  );
});

function CityCell({
  row,
}: {
  readonly row: { readonly name: string; readonly city: string };
}) {
  const { node } = usePrimaryColumnCompacts(row);
  return (
    <div>
      <span>{row.name}</span>
      {node}
    </div>
  );
}
