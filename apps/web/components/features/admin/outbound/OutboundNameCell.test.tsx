import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OutboundNameCell } from './OutboundNameCell';
import { outboundFixtureRow } from './outbound-fixtures';

describe('OutboundNameCell', () => {
  it('shows only the name and handle for an ordinary row', () => {
    render(<OutboundNameCell row={outboundFixtureRow()} />);
    expect(
      screen.queryByTestId('outbound-flag-existing-relationship')
    ).toBeNull();
    expect(screen.queryByTestId('outbound-relationship-note')).toBeNull();
    expect(screen.queryByTestId('outbound-flag-non-artist')).toBeNull();
  });

  it('labels an artist held for an existing relationship, with the reason', () => {
    const hold = 'Existing relationship: flag to Tim, no cold outreach';
    render(
      <OutboundNameCell
        row={outboundFixtureRow({
          name: 'Dannic',
          handle: 'djdannic',
          view: 'held',
          flags: ['existing_relationship'],
          relationshipHold: hold,
        })}
      />
    );
    const flag = screen.getByTestId('outbound-flag-existing-relationship');
    expect(flag).toHaveTextContent('Existing relationship');
    expect(flag).toHaveAttribute('title', hold);
  });

  it('tags a noted relationship on an artist who stays eligible', () => {
    const note = "Relationship: Armada Music, Tim's vocalist deals";
    render(
      <OutboundNameCell
        row={outboundFixtureRow({ relationshipNotes: [note] })}
      />
    );
    expect(screen.getByTestId('outbound-relationship-note')).toHaveTextContent(
      note
    );
    expect(
      screen.queryByTestId('outbound-flag-existing-relationship')
    ).toBeNull();
  });
});
