import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LISTEN_COOKIE } from '@/constants/app';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PROFILE_STORY_ARTIST } from '../profile-story-fixture';

const mocks = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock('@/lib/flags/client', () => ({ useAppFlag: () => false }));
vi.mock('@/lib/analytics', () => ({ track: mocks.track }));
vi.mock('@/lib/deep-links', () => ({
  getDSPDeepLinkConfig: () => null,
  openDeepLink: vi.fn(),
}));

import { ListenView } from './ListenView';
import {
  LISTEN_VIEW_DSPS,
  LISTEN_VIEW_MANY_DSPS,
} from './listen-view-state-fixtures';

describe('ListenView', () => {
  beforeEach(() => mocks.track.mockReset());

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(LISTEN_COOKIE);
    document.cookie = `${LISTEN_COOKIE}=; path=/; max-age=0`;
  });

  it('opens a service, remembers it and tracks the listen click', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(globalThis, 'open').mockReturnValue(null);
    const { container } = render(
      <ListenView artist={PROFILE_STORY_ARTIST} dsps={LISTEN_VIEW_DSPS} />
    );

    const nav = screen.getByRole('navigation', {
      name: 'Listen On Streaming Services',
    });
    expect(within(nav).getAllByRole('link')).toHaveLength(2);
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('link', { name: 'Listen on Spotify' }));
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        LISTEN_VIEW_DSPS.find(dsp => dsp.key === 'spotify')?.url,
        '_blank',
        'noopener,noreferrer'
      )
    );
    expect(mocks.track).toHaveBeenCalledWith(
      'listen_click',
      expect.objectContaining({
        handle: PROFILE_STORY_ARTIST.handle,
        platform: 'spotify',
      })
    );
    expect(localStorage.getItem(LISTEN_COOKIE)).toBe('spotify');
  });

  it('shows the empty note when the profile has no streaming links', async () => {
    const { container } = render(
      <ListenView artist={PROFILE_STORY_ARTIST} dsps={[]} />
    );

    expect(
      screen.getByText("Streaming links aren't available for this profile yet.")
    ).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('lists every service and stays axe-clean in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ListenView
          artist={PROFILE_STORY_ARTIST}
          dsps={LISTEN_VIEW_MANY_DSPS}
          enableDynamicEngagement
        />
      </div>
    );

    expect(screen.getAllByRole('link')).toHaveLength(
      LISTEN_VIEW_MANY_DSPS.length
    );
    expect(LISTEN_VIEW_MANY_DSPS.length).toBeGreaterThan(4);
    await expectNoA11yViolations(container);
  });
});
