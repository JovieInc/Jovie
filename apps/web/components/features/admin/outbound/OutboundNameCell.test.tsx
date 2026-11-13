import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OutboundNameCell } from './OutboundNameCell';
import { outboundFixtureRow } from './outbound-fixtures';

describe('OutboundNameCell', () => {
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
});
