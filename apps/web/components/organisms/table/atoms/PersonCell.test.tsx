import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  inspectLoadingOwners,
  loadingOwnerIssueCodes,
} from '@/tests/utils/loading-owner';
import { PersonCell, PersonCellSkeleton } from './PersonCell';
import { SkeletonRow } from './SkeletonRow';

describe('PersonCell', () => {
  it('uses canonical placeholders under the containing loading owner', () => {
    const { container } = render(
      <div
        role='status'
        aria-busy='true'
        aria-live='polite'
        aria-label='Loading people'
      >
        <PersonCellSkeleton />
      </div>
    );

    expect(loadingOwnerIssueCodes(inspectLoadingOwners(container))).toEqual([]);
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
      2
    );
  });

  it('shows a neutral face for an unidentified person', () => {
    const { container } = render(<PersonCell name='Anonymous Fan' anonymous />);

    expect(screen.getByText('Anonymous Fan')).toBeVisible();
    expect(
      container.querySelector('[data-slot="app-avatar"]')
    ).toHaveTextContent('?');
    expect(container).not.toHaveTextContent('AF');
  });

  it('links only the name while keeping secondary content and actions outside it', () => {
    render(
      <PersonCell
        name='@artist'
        nameHref='/artist'
        secondary={<span>Subscriber</span>}
        trailing={<button type='button'>Message artist</button>}
      />
    );

    const link = screen.getByRole('link', { name: '@artist' });
    expect(link).toHaveAttribute('href', '/artist');
    expect(link).not.toContainElement(screen.getByText('Subscriber'));
    expect(link).not.toContainElement(
      screen.getByRole('button', { name: 'Message artist' })
    );
  });

  it('renders a 20px face, the name, and one secondary fact on one line', () => {
    const { container } = render(
      <PersonCell name='Ada Lovelace' secondary='ada@example.com' />
    );

    expect(screen.getByText('Ada Lovelace')).toBeVisible();
    expect(screen.getByText('ada@example.com')).toBeVisible();
    expect(
      container.querySelector('[data-slot="app-avatar-frame"]')
    ).toHaveAttribute('data-size', 'sm');
    // Initials stand in when there is no photo, so every person row has a face.
    expect(container).toHaveTextContent('AL');
    // One clamped line that can still shrink: nowrap (`truncate`) text sets the
    // auto-layout table's min-content width and pushes the table off-screen.
    expect(
      container.querySelector('.line-clamp-1.whitespace-normal.break-all')
    ).not.toBeNull();
    expect(container.querySelector('.truncate')).toBeNull();
  });

  it('omits the secondary slot and trailing slot when empty', () => {
    const { container } = render(<PersonCell name='Cher' />);

    expect(container.querySelector('.text-tertiary-token')).toBeNull();
    expect(container.querySelector('.ml-auto')).toBeNull();
  });

  it('renders a trailing glyph after the name', () => {
    render(
      <PersonCell name='Prince' trailing={<span title='Subscribed'>●</span>} />
    );

    expect(screen.getByTitle('Subscribed')).toBeInTheDocument();
  });

  it('reserves the same face and name geometry while loading', () => {
    const { container } = render(
      <table>
        <tbody>
          <SkeletonRow
            columns={2}
            columnConfig={[{ variant: 'person' }, { variant: 'text' }]}
          />
        </tbody>
      </table>
    );

    expect(
      container.querySelector('.system-b-table-skeleton-person-face')
    ).not.toBeNull();
    expect(
      container.querySelector('.system-b-table-skeleton-person-name')
    ).not.toBeNull();

    const { container: sized } = render(<PersonCellSkeleton width='240px' />);
    expect(sized.firstElementChild).toHaveStyle({ width: '240px' });
  });

  it('opens the name link without also selecting the row', () => {
    const onRowClick = vi.fn();
    render(
      <PersonCell
        name='Ada Lovelace'
        nameHref='/people/ada'
        secondary='Subscriber'
      />
    );
    document.body.addEventListener('click', onRowClick);

    fireEvent.click(screen.getByRole('link', { name: 'Ada Lovelace' }));
    expect(onRowClick).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Subscriber'));
    expect(onRowClick).toHaveBeenCalledTimes(1);
    document.body.removeEventListener('click', onRowClick);
  });

  it.each([
    [
      'full',
      <PersonCell
        key='full'
        name='Maya Okafor'
        nameHref='/people/maya'
        secondary='maya@example.com'
        verified
      />,
    ],
    ['partial', <PersonCell key='partial' name='Jordan Reyes' />],
    ['anonymous', <PersonCell key='anon' name='Anonymous Fan' anonymous />],
    [
      'long',
      <PersonCell
        key='long'
        name='Alexandria Constantinople-Whitfield of The Midnight Orchestra'
        secondary='alexandria.constantinople-whitfield@example-records-group.com'
      />,
    ],
    [
      'rtl',
      <div key='rtl' dir='rtl' lang='ar'>
        <PersonCell name='ليلى حداد' secondary='layla@example.com' />
      </div>,
    ],
  ])('has no accessibility violations when %s', async (_name, ui) => {
    const { container } = render(ui);
    await expectNoA11yViolations(container);
  });
});
