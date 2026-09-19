import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DisclosureRow } from './DisclosureRow';

describe('DisclosureRow', () => {
  it('hides L3 detail until the row is opened', async () => {
    const user = userEvent.setup();

    render(
      <DisclosureRow label='Rightsholders' summary='2 observed' testId='rights'>
        <p>Songview is an observation, not master ownership.</p>
      </DisclosureRow>
    );

    expect(
      screen.queryByText('Songview is an observation, not master ownership.')
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Rightsholders/ }));

    expect(
      screen.getByText('Songview is an observation, not master ownership.')
    ).toBeVisible();
    expect(screen.getByTestId('rights')).toHaveAttribute(
      'data-disclosure-level',
      'l3'
    );
  });
});
