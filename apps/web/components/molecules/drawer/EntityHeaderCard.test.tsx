import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EntityHeaderCard } from './EntityHeaderCard';

describe('EntityHeaderCard', () => {
  it('does not clamp the subtitle by default outside stable layout', () => {
    render(<EntityHeaderCard title='Audience member' subtitle='Artist team' />);
    expect(screen.getByText('Artist team')).not.toHaveClass('line-clamp-1');
  });

  it('reserves optional slots in stable layout', () => {
    render(
      <EntityHeaderCard
        title='Long entity name'
        stableLayout
        reserveFooterSlot
        data-testid='entity-header'
      />
    );

    expect(screen.getByText('Long entity name')).toHaveClass(
      'line-clamp-1',
      'min-h-6'
    );
    expect(screen.getByTestId('entity-header-meta-slot')).toHaveClass(
      'invisible'
    );
  });

  it('renders stable metadata as a single horizontal rail', () => {
    render(
      <EntityHeaderCard
        title='Track title'
        stableLayout
        meta={
          <>
            <span>3:42</span>
            <span>USRC12345678</span>
            <span>Explicit</span>
          </>
        }
      />
    );

    const rail = screen.getByTestId(
      'entity-header-meta-slot'
    ).firstElementChild;
    expect(rail).toHaveClass('overflow-x-auto', 'whitespace-nowrap');
  });

  it('preserves the subtitle row when requested', () => {
    render(
      <EntityHeaderCard
        title='Audience member'
        stableLayout
        reserveSubtitleSlot
      />
    );

    const title = screen.getByText('Audience member');
    expect(title).toBeInTheDocument();
    expect(title.parentElement?.nextElementSibling).toHaveClass(
      'invisible',
      'min-h-4'
    );
  });

  it('assigns image, identity, metadata, and actions to explicit grid cells', () => {
    render(
      <EntityHeaderCard
        layout='grid'
        title='Alex Rivera'
        subtitle='Management'
        image={<span>AR</span>}
        meta={<span>North America</span>}
        actions={<button type='button'>More actions</button>}
        data-testid='entity-header'
      />
    );

    const header = screen.getByTestId('entity-header');
    const image = header.querySelector('[data-entity-header-image]');
    const identity = header.querySelector('[data-entity-header-identity]');
    const metadata = header.querySelector('[data-entity-header-metadata]');
    const actions = header.querySelector('[data-entity-header-actions]');

    expect(header).toHaveAttribute('data-layout', 'grid');
    expect(header).toHaveClass(
      'grid',
      'grid-cols-[auto_minmax(0,1fr)_auto]',
      'grid-rows-[auto_auto]'
    );
    expect(image).toHaveClass('col-start-1', 'row-span-2', 'row-start-1');
    expect(identity).toHaveClass('col-start-2', 'row-start-1');
    expect(metadata).toHaveClass('col-span-2', 'col-start-2', 'row-start-2');
    expect(actions).toHaveClass('col-start-3', 'row-start-1');
  });
});
