import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHELL_RAIL_MOTION_MS } from '@/components/shell/rail-motion';
import { useContainerWidth } from './useContainerWidth';

let fire: (width: number) => void = () => {};
const commits = vi.fn();

function Probe() {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const width = useContainerWidth(node, 800);
  commits(width);
  return (
    <div ref={setNode} data-testid='probe'>
      {width}
    </div>
  );
}

function setRailPhase(phase: 'open' | 'opening' | 'closing' | 'closed') {
  let rail = document.querySelector('[data-testid="rail"]');
  if (!rail) {
    rail = document.createElement('div');
    rail.setAttribute('data-testid', 'rail');
    document.body.appendChild(rail);
  }
  rail.setAttribute('data-rail-phase', phase);
}

describe('useContainerWidth', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    commits.mockClear();
    vi.stubGlobal(
      'ResizeObserver',
      class MockResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          fire = width =>
            callback(
              [{ contentRect: { width } } as ResizeObserverEntry],
              {} as ResizeObserver
            );
        }

        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      }
    );
  });

  afterEach(() => {
    document.querySelector('[data-testid="rail"]')?.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('commits every measurement immediately while no rail is moving', () => {
    setRailPhase('open');
    render(<Probe />);

    act(() => fire(640));
    expect(screen.getByTestId('probe')).toHaveTextContent('640');

    act(() => fire(600));
    expect(screen.getByTestId('probe')).toHaveTextContent('600');
  });

  it('commits once, at the settled width, for a whole rail motion', () => {
    render(<Probe />);
    act(() => fire(1000));
    commits.mockClear();

    setRailPhase('closing');
    // One observer tick per animation frame of the 420ms push.
    for (let frame = 1; frame <= 25; frame += 1) {
      act(() => {
        fire(1000 + frame * 6.72);
        vi.advanceTimersByTime(16);
      });
    }

    expect(commits).not.toHaveBeenCalled();
    expect(screen.getByTestId('probe')).toHaveTextContent('1000');

    setRailPhase('closed');
    act(() => {
      vi.advanceTimersByTime(64);
    });

    expect(commits).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('probe')).toHaveTextContent('1168');
  });

  it('releases a held width if the rail phase never settles', () => {
    render(<Probe />);
    setRailPhase('opening');

    act(() => fire(720));
    expect(screen.getByTestId('probe')).toHaveTextContent('800');

    act(() => {
      vi.advanceTimersByTime(SHELL_RAIL_MOTION_MS + 260);
    });

    expect(screen.getByTestId('probe')).toHaveTextContent('720');
  });

  it('does not commit a held width after unmount', () => {
    const { unmount } = render(<Probe />);
    setRailPhase('opening');
    act(() => fire(720));
    commits.mockClear();

    unmount();
    setRailPhase('open');
    act(() => {
      vi.advanceTimersByTime(SHELL_RAIL_MOTION_MS);
    });

    expect(commits).not.toHaveBeenCalled();
  });
});
