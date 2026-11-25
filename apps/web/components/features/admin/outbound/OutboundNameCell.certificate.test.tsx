import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OutboundNameCell } from './OutboundNameCell';
import { outboundFixtureRow } from './outbound-fixtures';

describe('OutboundNameCell certificate', () => {
  it('renders an untagged row axe-clean', async () => {
    const { container } = render(
      <OutboundNameCell row={outboundFixtureRow()} />
    );
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('@ada')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders the hold, note and non-artist tags together axe-clean', async () => {
    const { container } = render(
      <OutboundNameCell
        row={outboundFixtureRow({
          flags: ['existing_relationship', 'possible_non_artist'],
          relationshipHold: 'Existing relationship: no cold outreach',
          relationshipNotes: ['Relationship: Armada Music'],
          entityNote: 'Looks like a label account',
        })}
      />
    );
    expect(
      screen.getByTestId('outbound-flag-existing-relationship')
    ).toBeInTheDocument();
    expect(screen.getByTestId('outbound-relationship-note')).toHaveTextContent(
      'Relationship: Armada Music'
    );
    expect(screen.getByTestId('outbound-flag-non-artist')).toHaveAttribute(
      'title',
      'Looks like a label account'
    );
    await expectNoA11yViolations(container);
  });
});
