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
      'min-h-[22px]'
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
      'min-h-[16px]'
    );
  });
});
