import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { FilterSubmenu } from './FilterSubmenu';

type Props = ComponentProps<typeof FilterSubmenu>;

const OPTIONS = [
  { id: 'album', label: 'Album', iconName: 'Layers' },
  { id: 'ep', label: 'EP', iconName: 'Layers2' },
  { id: 'single', label: 'Single' },
];

function renderSubmenu(overrides: Partial<Props> = {}) {
  const onToggle = vi.fn();
  const view = render(
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <button type='button'>Open filters</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <FilterSubmenu
          label='Release Type'
          iconName='Layers'
          options={OPTIONS}
          selectedIds={['album']}
          onToggle={onToggle}
          counts={{ album: 5, ep: 2 }}
          searchPlaceholder='Search types...'
          {...overrides}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
  return { ...view, onToggle };
}

/**
 * Opens the submenu from the keyboard. jsdom has no layout, so Radix cannot
 * tell a pointer leaving the trigger for the submenu from one leaving it for
 * good, and a pointer-opened submenu would close on the first click inside.
 */
async function openSubmenu(
  user: ReturnType<typeof userEvent.setup>,
  placeholder = 'Search types...'
) {
  screen.getByRole('menuitem', { name: /Release Type/ }).focus();
  await user.keyboard('{ArrowRight}');
  const search = await screen.findByRole('textbox', { name: placeholder });
  // Opening schedules search focus. Wait for that transition before sending
  // option keys, otherwise the delayed focus can redirect Enter to the input.
  await waitFor(() => expect(search).toHaveFocus());
  return search;
}

// The menu is portaled to the body, outside any landmark; the page landmark
// rule belongs to the page, not to this submenu.
const PORTAL_AXE_OPTIONS = { rules: { region: { enabled: false } } };

describe('FilterSubmenu certificate', () => {
  it('shows the selected count on the category and toggles options by click', async () => {
    const user = userEvent.setup();
    const { onToggle } = renderSubmenu();

    const trigger = screen.getByRole('menuitem', { name: /Release Type/ });
    expect(trigger).toHaveTextContent('1');

    await openSubmenu(user);
    const album = screen.getByRole('menuitemcheckbox', { name: /Album/ });
    const ep = screen.getByRole('menuitemcheckbox', { name: /EP/ });
    expect(album).toHaveAttribute('aria-checked', 'true');
    expect(album).toHaveTextContent('5');
    expect(ep).toHaveAttribute('aria-checked', 'false');
    // An option with no count entry falls back to zero.
    expect(
      screen.getByRole('menuitemcheckbox', { name: /Single/ })
    ).toHaveTextContent('0');

    await user.click(ep);
    expect(onToggle).toHaveBeenCalledWith('ep');
    await user.click(album);
    expect(onToggle).toHaveBeenLastCalledWith('album');
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it('filters options as the user types, keeps the typed text, and clears it', async () => {
    const user = userEvent.setup();
    renderSubmenu();

    const search = await openSubmenu(user);
    await user.type(search, 'sin');
    expect(search).toHaveValue('sin');
    expect(screen.getAllByRole('menuitemcheckbox')).toHaveLength(1);
    expect(
      screen.getByRole('menuitemcheckbox', { name: /Single/ })
    ).toBeInTheDocument();

    await user.type(search, 'zzz');
    expect(search).toHaveValue('sinzzz');
    expect(screen.queryByRole('menuitemcheckbox')).toBeNull();
    expect(screen.getByText('No options found')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear Search' }));
    expect(search).toHaveValue('');
    expect(search).toHaveFocus();
    expect(screen.getAllByRole('menuitemcheckbox')).toHaveLength(3);
  });

  it('toggles from the keyboard and clears the search on Escape', async () => {
    const user = userEvent.setup();
    const { onToggle } = renderSubmenu();

    const search = await openSubmenu(user);
    const ep = screen.getByRole('menuitemcheckbox', { name: /EP/ });
    ep.focus();
    await user.keyboard('{Enter}');
    expect(onToggle).toHaveBeenCalledWith('ep');
    await user.keyboard(' ');
    expect(onToggle).toHaveBeenCalledTimes(2);

    // Escape on an option hands focus back to the search field.
    await user.keyboard('{Escape}');
    expect(search).toHaveFocus();

    await user.type(search, 'ep');
    await user.keyboard('{Escape}');
    expect(search).toHaveValue('');
    expect(screen.getAllByRole('menuitemcheckbox')).toHaveLength(3);
  });

  it('resets the search when the submenu closes', async () => {
    const user = userEvent.setup();
    renderSubmenu();

    const search = await openSubmenu(user);
    await user.type(search, 'ep');
    expect(screen.getAllByRole('menuitemcheckbox')).toHaveLength(1);

    screen.getByRole('menuitemcheckbox', { name: /EP/ }).focus();
    await user.keyboard('{ArrowLeft}');
    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: 'Search types...' })
      ).toBeNull()
    );

    const reopened = await openSubmenu(user);
    expect(reopened).toHaveValue('');
    expect(screen.getAllByRole('menuitemcheckbox')).toHaveLength(3);
  });

  it('shows the empty row for a category with no options and hides the badge', async () => {
    const user = userEvent.setup();
    renderSubmenu({
      options: [],
      selectedIds: [],
      searchPlaceholder: undefined,
    });

    expect(
      screen.getByRole('menuitem', { name: /Release Type/ })
    ).not.toHaveTextContent(/\d/);
    expect(await openSubmenu(user, 'Search...')).toBeInTheDocument();
    expect(screen.getByText('No options found')).toBeInTheDocument();
  });

  it('keeps the open submenu and its empty state axe-clean', async () => {
    const user = userEvent.setup();
    const { baseElement } = renderSubmenu();

    await openSubmenu(user);
    await expectNoA11yViolations(baseElement, PORTAL_AXE_OPTIONS);
    await user.type(
      screen.getByRole('textbox', { name: 'Search types...' }),
      'zzz'
    );
    expect(screen.getByText('No options found')).toBeInTheDocument();
    await expectNoA11yViolations(baseElement, PORTAL_AXE_OPTIONS);
  });

  it('renders no category when filtered out of the main menu', () => {
    renderSubmenu({ isVisible: false });
    expect(screen.queryByRole('menuitem', { name: /Release Type/ })).toBeNull();
  });
});
