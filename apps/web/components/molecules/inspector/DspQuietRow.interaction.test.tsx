import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { DspQuietRow } from './DspQuietRow';

it('reserves the destination open icon and reveals it when its link receives keyboard focus', async () => {
  render(
    <DspQuietRow
      label='Spotify'
      icon={<span aria-hidden='true'>S</span>}
      href='https://open.spotify.com/'
    />
  );
  const row = screen.getByRole('link', { name: 'Spotify' });
  const icon = row.querySelector('[data-slot="hover-reveal"]');
  expect(icon).toHaveClass(
    'h-3',
    'w-3',
    'shrink-0',
    'opacity-0',
    'group-focus-within:opacity-100'
  );
  await userEvent.tab();
  expect(row).toHaveFocus();
  expect(row).toHaveAttribute('href', 'https://open.spotify.com/');
});
