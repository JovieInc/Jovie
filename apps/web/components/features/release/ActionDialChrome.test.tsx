import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { DspServiceIcon } from '@/components/atoms/DspLogo';
import type { ActionDialOption } from './ActionDial';
import {
  ActionDialIconTrack,
  ActionDialSelectionCue,
  actionDialStreamIcon,
} from './ActionDialChrome';

const spotify: ActionDialOption = {
  id: 'spotify',
  label: 'Spotify',
  icon: <DspServiceIcon provider='spotify' />,
};

describe('ActionDialChrome', () => {
  it('renders the icon reel for nearby windowed options', () => {
    const iconRefs = createRef<Map<number, HTMLElement>>();
    iconRefs.current = new Map();
    const windowed = [
      [0, spotify],
      [
        1,
        {
          id: 'apple_music',
          label: 'Apple Music',
          icon: <DspServiceIcon provider='apple_music' />,
        },
      ],
    ] as const;

    render(
      <ActionDialIconTrack
        windowed={windowed}
        activeIndex={0}
        position={0}
        iconRefs={iconRefs}
      />
    );

    expect(screen.getByTestId('action-dial-icon-track')).toBeInTheDocument();
    expect(screen.getByTestId('action-dial-icon-spotify')).toBeInTheDocument();
  });

  it('shows Remembered when the selection is preferred', () => {
    const hintGlyphRef = createRef<HTMLSpanElement | null>();
    render(
      <ActionDialSelectionCue
        label='Spotify'
        isPreferred
        showHint={false}
        hintGlyphRef={hintGlyphRef}
        multi
        hintId='hint'
        hint='Swipe to switch'
      />
    );

    expect(screen.getByTestId('action-dial-selection')).toHaveTextContent(
      'Remembered'
    );
  });

  it('falls back to the active icon when the reel has fewer than two services', () => {
    expect(actionDialStreamIcon(1, spotify, <span>track</span>)).toBe(
      spotify.icon
    );
  });
});
