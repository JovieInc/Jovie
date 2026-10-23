import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span data-alt={alt} data-src={src} />
  ),
}));

import { CommandPalettePanel } from './CommandPalettePanel';

describe('CommandPalettePanel', () => {
  it('shows the default registry groups and hides flag-gated rows', () => {
    render(<CommandPalettePanel />);

    expect(
      screen.getByRole('combobox', { name: 'Command Palette Search' })
    ).toBeVisible();
    expect(screen.getAllByRole('option')).toHaveLength(10);
    expect(screen.getByRole('option', { name: /^Home/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('option', { name: /^Work/ })).toBeVisible();
    expect(screen.getByRole('option', { name: /^Profile/ })).toBeVisible();
    expect(
      screen.getByRole('option', { name: /^Generate pitch/ })
    ).toBeVisible();
    expect(
      screen.getByRole('option', { name: /^Remove social link/ })
    ).toBeVisible();
    expect(screen.queryByRole('option', { name: /^Identity/ })).toBeNull();
    expect(screen.queryByRole('option', { name: /^Settings/ })).toBeNull();
    expect(screen.queryByRole('option', { name: /^Send feedback/ })).toBeNull();
    expect(screen.queryByText('Artists')).toBeNull();
    expect(
      screen.getByText(
        'Showing top five per group. Type to search all results.'
      )
    ).toBeVisible();
  });

  it('searches past the default cap and commits the highlighted command', async () => {
    const user = userEvent.setup();
    render(<CommandPalettePanel />);

    const input = screen.getByRole('combobox', {
      name: 'Command Palette Search',
    });
    await user.type(input, 'settings');

    expect(screen.getByRole('option', { name: /^Settings/ })).toBeVisible();
    expect(
      screen.queryByText(
        'Showing top five per group. Type to search all results.'
      )
    ).toBeNull();

    await user.clear(input);
    await user.keyboard('{ArrowDown}{Enter}');

    expect(screen.getByTestId('shared-command-palette')).toHaveAttribute(
      'data-committed-command',
      'go-work'
    );
    expect(screen.queryByText('Artists')).toBeNull();
  });

  it('commits a skill from the registry when its row is chosen', async () => {
    const user = userEvent.setup();
    render(<CommandPalettePanel />);

    await user.type(
      screen.getByRole('combobox', { name: 'Command Palette Search' }),
      'pitch'
    );
    await user.click(screen.getByRole('option', { name: /^Generate pitch/ }));

    expect(screen.getByTestId('shared-command-palette')).toHaveAttribute(
      'data-committed-command',
      'generateReleasePitch'
    );
  });

  it('says when nothing in the registry matches', async () => {
    const user = userEvent.setup();
    render(<CommandPalettePanel />);

    await user.type(
      screen.getByRole('combobox', { name: 'Command Palette Search' }),
      'zzzzzz'
    );

    expect(screen.getByText('No matches.')).toBeVisible();
    expect(screen.queryByRole('option')).toBeNull();
  });
});
