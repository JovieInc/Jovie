import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OutboundNameCell } from './OutboundNameCell';
import { outboundFixtureRow } from './outbound-fixtures';

describe('OutboundNameCell', () => {
  it('retains all relationship and entity evidence when warnings coexist', () => {
    const row = outboundFixtureRow({
      flags: ['existing_relationship', 'possible_non_artist'],
      relationshipHold: 'Existing relationship: flag to Tim, no cold outreach',
      relationshipNotes: ['Relationship note retained from source'],
      entityNote: 'Possible non-artist review required',
    });
    render(<OutboundNameCell row={row} />);
    expect(
      screen.getByTestId('outbound-flag-existing-relationship')
    ).toHaveAttribute('title', row.relationshipHold);
    expect(screen.getByTestId('outbound-flag-non-artist')).toHaveAttribute(
      'title',
      row.entityNote
    );
    expect(screen.getByTestId('outbound-relationship-note')).toHaveTextContent(
      row.relationshipNotes[0]
    );
    expect(screen.getByTestId('outbound-relationship-note')).toHaveAttribute(
      'title',
      row.relationshipNotes[0]
    );
  });
  it('retains the source handle without inventing a missing display name', () => {
    const row = outboundFixtureRow({ name: '', handle: 'source_handle' });
    render(
      <TooltipProvider>
        <OutboundNameCell row={row} />
      </TooltipProvider>
    );
    expect(screen.getByTitle('')).toBeEmptyDOMElement();
    expect(screen.getByTitle('@source_handle')).toHaveTextContent(
      '@source_handle'
    );
    expect(row.name).toBe('');
  });

  it('preserves the full imported identity when the cell truncates visually', () => {
    const row = outboundFixtureRow({
      name: 'Ada — Listen on YouTube, Spotify, Apple Music',
      handle: 'ada_with_a_long_imported_handle',
    });
    render(
      <TooltipProvider>
        <OutboundNameCell row={row} />
      </TooltipProvider>
    );
    expect(screen.getByTitle(row.name)).toHaveTextContent(row.name);
    expect(screen.getByTitle(`@${row.handle}`)).toHaveTextContent(
      `@${row.handle}`
    );
    expect(screen.queryByTestId('outbound-flag-non-artist')).toBeNull();
  });

  it('keeps the non-artist warning and its source note alongside the identity', () => {
    const row = outboundFixtureRow({
      flags: ['possible_non_artist'],
      entityNote: 'Looks like a playlist curator or submission service',
    });
    render(
      <TooltipProvider>
        <OutboundNameCell row={row} />
      </TooltipProvider>
    );
    expect(screen.getByTitle(row.name)).toHaveTextContent(row.name);
    expect(screen.getByTestId('outbound-flag-non-artist')).toHaveTextContent(
      'Possible non-artist'
    );
    expect(screen.getByTitle(row.entityNote!)).toBeInTheDocument();
  });
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
