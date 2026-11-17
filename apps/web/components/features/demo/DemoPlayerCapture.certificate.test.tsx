import { render, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DEMO_PLAYER_RELEASE, DemoPlayerCapture } from './DemoPlayerCapture';

let params = new URLSearchParams();
vi.mock('next/navigation', () => ({ useSearchParams: () => params }));

afterEach(() => {
  params = new URLSearchParams();
});

describe('DemoPlayerCapture certificate', () => {
  it('draws nothing itself and seeds the player at the default timestamp', async () => {
    const { result } = renderHook(useTrackAudioPlayer);
    const { container, unmount } = render(<DemoPlayerCapture />);

    expect(container).toBeEmptyDOMElement();
    expect(result.current.playbackState).toMatchObject({
      activeTrackId: DEMO_PLAYER_RELEASE.id,
      currentTime: 78,
    });
    await expectNoA11yViolations(container);
    unmount();
    expect(result.current.playbackState.activeTrackId).toBeNull();
  });

  it('reseeds the player when the timestamp parameter changes', async () => {
    params.set('playerTimestamp', '0:42');
    const { result } = renderHook(useTrackAudioPlayer);
    const { container, unmount } = render(<DemoPlayerCapture />);

    expect(result.current.playbackState.currentTime).toBe(42);
    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
    unmount();
  });
});
