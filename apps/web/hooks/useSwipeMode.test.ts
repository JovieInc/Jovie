import { act, renderHook } from '@testing-library/react';
import type { TouchEvent as ReactTouchEvent } from 'react';
import { describe, expect, it } from 'vitest';
import { useSwipeMode } from './useSwipeMode';

function createTouchEvent(
  type: 'touchstart' | 'touchmove' | 'touchend',
  clientX: number,
  clientY: number
): ReactTouchEvent<HTMLDivElement> {
  const touch = { clientX, clientY } as Touch;
  const touches = type === 'touchend' ? [] : [touch];

  return {
    touches,
    targetTouches: touches,
    changedTouches: [touch],
  } as unknown as ReactTouchEvent<HTMLDivElement>;
}

describe('useSwipeMode', () => {
  it('advances to the next slide after a left swipe', () => {
    const { result } = renderHook(() => useSwipeMode({ count: 3 }));
    const container = document.createElement('div');
    Object.defineProperty(container, 'offsetWidth', {
      configurable: true,
      value: 320,
    });

    act(() => {
      result.current.containerRef.current = container;
      result.current.handlers.onTouchStart(
        createTouchEvent('touchstart', 240, 100)
      );
      result.current.handlers.onTouchMove(
        createTouchEvent('touchmove', 80, 100)
      );
      result.current.handlers.onTouchEnd();
    });

    expect(result.current.activeIndex).toBe(1);
    expect(result.current.dragOffset).toBe(0);
  });

  it('does not advance when the swipe is mostly vertical', () => {
    const { result } = renderHook(() => useSwipeMode({ count: 3 }));
    const container = document.createElement('div');
    Object.defineProperty(container, 'offsetWidth', {
      configurable: true,
      value: 320,
    });

    act(() => {
      result.current.containerRef.current = container;
      result.current.handlers.onTouchStart(
        createTouchEvent('touchstart', 200, 100)
      );
      result.current.handlers.onTouchMove(
        createTouchEvent('touchmove', 205, 220)
      );
      result.current.handlers.onTouchEnd();
    });

    expect(result.current.activeIndex).toBe(0);
  });
});
