import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { InfoPopover } from './InfoPopover';

describe('InfoPopover', () => {
  it('keeps helper copy off the compact row until ⓘ is opened', async () => {
    const user = userEvent.setup();

    render(
      <InfoPopover label='About downloads' testId='downloads-info'>
        Email gate to file. Only attested recordings can go live.
      </InfoPopover>
    );

    expect(
      screen.queryByText(
        'Email gate to file. Only attested recordings can go live.'
      )
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'About downloads' }));

    expect(screen.getByTestId('downloads-info-content')).toHaveTextContent(
      'Email gate to file. Only attested recordings can go live.'
    );
    expect(
      screen.getByRole('button', { name: 'About downloads' })
    ).toHaveAttribute('data-disclosure-level', 'l2');
  });

  it('names the popover content with the same label as its trigger', async () => {
    const user = userEvent.setup();

    render(
      <InfoPopover label='About downloads' testId='downloads-info'>
        Email gate to file.
      </InfoPopover>
    );

    await user.click(screen.getByRole('button', { name: 'About downloads' }));

    expect(screen.getByTestId('downloads-info-content')).toHaveAttribute(
      'aria-label',
      'About downloads'
    );
  });
});
