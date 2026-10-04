import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PersonCell, PersonCellSkeleton } from './PersonCell';
import { SkeletonRow } from './SkeletonRow';

describe('PersonCell', () => {
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
    expect(container.querySelector('.truncate')).not.toBeNull();
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
});
