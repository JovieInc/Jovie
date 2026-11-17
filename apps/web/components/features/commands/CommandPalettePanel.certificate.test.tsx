import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span data-alt={alt} data-src={src} />
  ),
}));

import { CommandPalettePanel } from './CommandPalettePanel';

describe('CommandPalettePanel certificate', () => {
  it('renders the default command list axe-clean', async () => {
    const { container } = render(<CommandPalettePanel />);

    expect(
      screen.getByRole('combobox', { name: 'Command Palette Search' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean with search results and with no match', async () => {
    const user = userEvent.setup();
    const { container } = render(<CommandPalettePanel />);
    const input = screen.getByRole('combobox', {
      name: 'Command Palette Search',
    });

    await user.type(input, 'settings');
    expect(input).toHaveValue('settings');
    expect(
      screen.getByRole('option', { name: /^Settings/ })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.clear(input);
    await user.type(input, 'zzzz-no-such-command');
    expect(screen.queryByRole('option', { name: /^Settings/ })).toBeNull();
    await expectNoA11yViolations(container);
  });
});
