import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { UniversalLinkInputPlatformSelector } from './UniversalLinkInputPlatformSelector';
import {
  ARTIST_SEARCH_PLATFORMS,
  PLATFORM_OPTIONS,
} from './universalLinkInput.constants';

function renderSelector(disabled = false) {
  const handlers = {
    onPlatformSelect: vi.fn(),
    onArtistSearchSelect: vi.fn(),
    onRestoreFocus: vi.fn(),
  };
  const view = render(
    <UniversalLinkInputPlatformSelector {...handlers} disabled={disabled} />
  );
  return { ...view, ...handlers };
}

describe('UniversalLinkInputPlatformSelector', () => {
  it('opens a menu of artist searches and platforms, axe-clean', async () => {
    const user = userEvent.setup();
    const { container } = renderSelector();

    const trigger = screen.getByRole('button', {
      name: 'Add link from platform',
    });
    expect(trigger).toHaveAttribute('type', 'button');
    await user.click(trigger);

    expect(await screen.findAllByRole('menuitem')).toHaveLength(
      ARTIST_SEARCH_PLATFORMS.length + PLATFORM_OPTIONS.length
    );
    await expectNoA11yViolations(container);
  });

  it('starts an artist search for the chosen provider', async () => {
    const user = userEvent.setup();
    const { onArtistSearchSelect } = renderSelector();

    await user.click(
      screen.getByRole('button', { name: 'Add link from platform' })
    );
    await user.click(
      await screen.findByRole('menuitem', {
        name: ARTIST_SEARCH_PLATFORMS[0].name,
      })
    );

    expect(onArtistSearchSelect).toHaveBeenCalledWith(
      ARTIST_SEARCH_PLATFORMS[0].provider
    );
  });

  it('selects a platform and returns focus to the field', async () => {
    const user = userEvent.setup();
    const { onPlatformSelect, onRestoreFocus } = renderSelector();

    await user.click(
      screen.getByRole('button', { name: 'Add link from platform' })
    );
    await user.click(
      await screen.findByRole('menuitem', { name: PLATFORM_OPTIONS[0].name })
    );

    expect(onPlatformSelect).toHaveBeenCalledWith(PLATFORM_OPTIONS[0]);
    await vi.waitFor(() => expect(onRestoreFocus).toHaveBeenCalledWith('end'));
  });

  it('does not open while disabled', async () => {
    const user = userEvent.setup();
    renderSelector(true);

    const trigger = screen.getByRole('button', {
      name: 'Add link from platform',
    });
    expect(trigger).toBeDisabled();
    await user.click(trigger);

    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });
});
