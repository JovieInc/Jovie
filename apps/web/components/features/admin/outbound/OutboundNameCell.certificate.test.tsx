import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OutboundNameCell } from './OutboundNameCell';
import { outboundFixtureRow } from './outbound-fixtures';

const LONG_NAME =
  'Aurelia Montgomery-Fitzgerald and the Extraordinarily Long Named Midnight Orchestra';
const LONG_NOTE =
  "Relationship: Armada Music, Tim's vocalist deals across the last three release cycles";

describe('OutboundNameCell certificate states', () => {
  it('shows only the name and handle when the row has no tags', async () => {
    const { container } = render(
      <OutboundNameCell row={outboundFixtureRow()} />
    );
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('@ada')).toBeInTheDocument();
    expect(screen.queryByTestId('outbound-relationship-note')).toBeNull();
    expect(
      screen.queryByTestId('outbound-flag-existing-relationship')
    ).toBeNull();
    expect(screen.queryByTestId('outbound-flag-non-artist')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('truncates long copy and keeps the full text in each tag title', async () => {
    const { container } = render(
      <OutboundNameCell
        row={outboundFixtureRow({
          name: LONG_NAME,
          handle: 'aurelia-montgomery-fitzgerald-official-account',
          flags: ['existing_relationship', 'possible_non_artist'],
          relationshipHold:
            'Existing relationship: flag to Tim, no cold outreach',
          relationshipNotes: [LONG_NOTE, 'Relationship: Spinnin'],
          entityNote: 'Looks like a playlist curator or submission service',
        })}
      />
    );
    expect(screen.getByText(LONG_NAME)).toHaveClass('truncate');
    expect(
      screen.getByText('@aurelia-montgomery-fitzgerald-official-account')
    ).toHaveClass('truncate');
    expect(
      screen.getByTestId('outbound-flag-existing-relationship')
    ).toHaveAttribute(
      'title',
      'Existing relationship: flag to Tim, no cold outreach'
    );
    const notes = screen.getAllByTestId('outbound-relationship-note');
    expect(notes).toHaveLength(2);
    expect(notes[0]).toHaveAttribute('title', LONG_NOTE);
    expect(notes[0]).toHaveClass('truncate');
    expect(screen.getByTestId('outbound-flag-non-artist')).toHaveAttribute(
      'title',
      'Looks like a playlist curator or submission service'
    );
    await expectNoA11yViolations(container);
  });

  it('flags a possible non-artist without a note', () => {
    render(
      <OutboundNameCell
        row={outboundFixtureRow({ flags: ['possible_non_artist'] })}
      />
    );
    expect(screen.getByTestId('outbound-flag-non-artist')).not.toHaveAttribute(
      'title'
    );
  });

  it('stays axe clean inside a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <OutboundNameCell
          row={outboundFixtureRow({
            name: 'ليلى الحسن',
            handle: 'layla',
            relationshipNotes: ['علاقة: شركة التسجيلات'],
          })}
        />
      </div>
    );
    expect(screen.getByText('ليلى الحسن')).toBeInTheDocument();
    expect(screen.getByTestId('outbound-relationship-note')).toHaveTextContent(
      'علاقة: شركة التسجيلات'
    );
    await expectNoA11yViolations(container);
  });
});
