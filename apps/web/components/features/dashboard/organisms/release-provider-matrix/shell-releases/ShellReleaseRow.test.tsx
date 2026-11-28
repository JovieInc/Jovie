import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentPropsWithoutRef, forwardRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const toggleTrack = vi.fn().mockResolvedValue(undefined);
const playback = vi.hoisted(() => ({
  state: {
    activeTrackId: null as string | null,
    isPlaying: false,
    playbackStatus: 'idle' as const,
  },
}));

vi.mock('next/link', () => ({
  default: forwardRef<
    HTMLAnchorElement,
    ComponentPropsWithoutRef<'a'> & { readonly prefetch?: boolean }
  >(function TestLink({ prefetch, ...props }, ref) {
    return <a {...props} data-prefetch={String(prefetch)} ref={ref} />;
  }),
}));

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => ({
    playbackState: playback.state,
    toggleTrack,
    seek: vi.fn(),
    stop: vi.fn(),
    onError: vi.fn(() => () => undefined),
  }),
}));

const { ShellReleaseRow } = await import('./ShellReleaseRow');

const release: ReleaseViewModel = {
  profileId: 'p',
  id: 'r1',
  title: 'Lost in the Light',
  artistNames: ['Bahamas'],
  status: 'released',
  artworkUrl: 'https://x.invalid/a.jpg',
  slug: 'lost-in-the-light',
  smartLinkPath: '/lost-in-the-light',
  providers: [],
  releaseType: 'single',
  isExplicit: false,
  totalTracks: 1,
  previewUrl: 'https://x.invalid/preview.mp3',
};

describe('ShellReleaseRow', () => {
  it('toggles preview playback from the scrim button without selecting the row', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { container } = render(
      <ul>
        <ShellReleaseRow
          release={release}
          isSelected={false}
          onSelect={onSelect}
        />
      </ul>
    );

    const play = screen.getByRole('button', { name: 'Play Lost in the Light' });
    expect(play.className).toContain('bg-ink-on-media/50');
    expect(play.className).toContain('text-on-media');
    expect(play.className).not.toContain('bg-black');
    await user.click(play);

    expect(toggleTrack).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('shows the pause label while the release is playing', async () => {
    playback.state = {
      activeTrackId: 'r1',
      isPlaying: true,
      playbackStatus: 'idle',
    };
    const { container } = render(
      <ul>
        <ShellReleaseRow
          release={release}
          isSelected
          onSelect={() => undefined}
        />
      </ul>
    );

    expect(
      screen.getByRole('button', { name: 'Pause Lost in the Light' })
    ).toHaveAttribute('aria-pressed', 'true');
    await expectNoA11yViolations(container);
    playback.state = {
      activeTrackId: null,
      isPlaying: false,
      playbackStatus: 'idle',
    };
  });

  it('keeps the shared overflow trigger from selecting the row', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { container } = render(
      <ul>
        <ShellReleaseRow
          release={{ ...release, previewUrl: null }}
          isSelected={false}
          onSelect={onSelect}
          actionMenuItems={[{ id: 'copy', label: 'Copy link' }]}
        />
      </ul>
    );

    // TableRowOverflowTrigger (DRI-22) — same ⋯ chrome as other entity tables.
    const trigger = screen.getByRole('button', {
      name: 'Release actions for Lost in the Light',
    });
    expect(trigger.querySelector('svg')).not.toBeNull();
    await user.click(trigger);
    expect(
      await screen.findByRole('menuitem', { name: /Copy link/ })
    ).toBeInTheDocument();

    expect(onSelect).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });
});

describe('ShellReleaseRow optical fixes (JOV-12568)', () => {
  it('keeps 28px circle actions, 14px glyphs and an ellipsised title', () => {
    const source = readFileSync(
      resolve(__dirname, './ShellReleaseRow.tsx'),
      'utf8'
    );

    expect(source).toContain(
      "'shrink-0 h-7 w-7 rounded-full grid place-items-center"
    );
    expect(source).toMatch(/<Clock\s+className='h-3\.5 w-3\.5'/);
    expect(source).toContain("<Lock className='h-3.5 w-3.5'");
    expect(source).toContain("<ExternalLink className='h-3.5 w-3.5'");
    expect(source).toContain('<PlayIcon');
    expect(source).toContain(
      "<span className='min-w-0 truncate'>{release.title}</span>"
    );
    expect(source).toContain("'min-w-0 shrink-9999'");
    expect(source).not.toContain('h-7 w-7 rounded-md');
    expect(source).not.toContain("className='h-3 w-3'");
    expect(source).not.toContain('translate-x-px');
  });
});
