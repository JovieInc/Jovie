/** rAF presentation-slot inference, not a GPU/compositor presentation trace.
 * https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
 * Declare the runner display cadence; never calibrate a stalled run downwards.
 */
export interface RefreshProfile {
  readonly refreshHz: 60 | 120;
  readonly toleranceMs: number;
}

export interface FrameSample {
  readonly timestamp: number;
  readonly foreground: boolean;
}

export function countMissedPresentationSlots({
  profile,
  samples,
}: {
  profile: RefreshProfile;
  samples: readonly FrameSample[];
}) {
  const periodMs = 1000 / profile.refreshHz;
  if (
    ![60, 120].includes(profile.refreshHz) ||
    !Number.isFinite(profile.toleranceMs) ||
    profile.toleranceMs < 0 ||
    profile.toleranceMs > Math.min(2, periodMs / 4)
  )
    throw new Error('Invalid refresh profile or scheduling tolerance');
  if (samples.length < 2) throw new Error('Insufficient frame samples');
  let droppedFrameCount = 0;
  let maxIntervalMs = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (!sample.foreground || !Number.isFinite(sample.timestamp)) {
      throw new Error('Invalid hidden/background frame measurement');
    }
    if (index === 0) continue;
    const interval = sample.timestamp - samples[index - 1].timestamp;
    if (interval <= 0 || interval < periodMs - profile.toleranceMs) {
      throw new Error('Non-monotonic clock or incompatible refresh cadence');
    }
    // A 2-period gap loses ONE slot; a 7-period stall loses SIX, not one.
    // Only the declared <=2ms allowance extends a slot deadline.
    // The epsilon absorbs floating point division at an exact boundary.
    droppedFrameCount += Math.max(
      0,
      Math.ceil((interval - profile.toleranceMs) / periodMs - 1e-9) - 1
    );
    maxIntervalMs = Math.max(maxIntervalMs, interval);
  }
  return {
    method: 'requestAnimationFrame-slot-inference' as const,
    droppedFrameCount,
    maxIntervalMs,
    intervalCount: samples.length - 1,
    profile,
  };
}

/** Self-contained: Playwright serializes this function into the page. */
export async function collectScrollFrames({
  selector,
  direction,
  frameCount = 120,
}: {
  selector: string;
  direction: 'up' | 'down';
  frameCount?: number;
}) {
  const viewport = document.querySelector<HTMLElement>(selector);
  if (
    !viewport ||
    viewport.clientHeight <= 0 ||
    viewport.scrollHeight <= viewport.clientHeight
  ) {
    throw new Error('Transcript viewport must be visible and overflow');
  }
  const samples: FrameSample[] = [];
  const positions: number[] = [];
  const visibleIds: string[][] = [];
  const startTop = viewport.scrollTop;
  let invalidated = false;
  const invalidate = () => {
    invalidated = true;
  };
  const onVisibility = () => {
    if (document.visibilityState !== 'visible') invalidate();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('blur', invalidate);
  window.addEventListener('pagehide', invalidate);
  let frameId = 0;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      // Hidden tabs may stop rAF entirely. Fail instead of hanging or returning 0.
      watchdog = setTimeout(
        () => reject(new Error('Frame sampling timed out')),
        15_000
      );
      const step = (timestamp: number) => {
        try {
          const foreground =
            !invalidated &&
            document.visibilityState === 'visible' &&
            document.hasFocus();
          if (!foreground)
            throw new Error('Invalid hidden/background frame measurement');
          samples.push({ timestamp, foreground });
          positions.push(viewport.scrollTop);
          // Inspect the window produced by the PREVIOUS scroll, before moving it.
          const clip = viewport.getBoundingClientRect();
          const visible = Array.from(
            viewport.querySelectorAll<HTMLElement>('[data-message-id]')
          ).filter(row => {
            const rect = row.getBoundingClientRect();
            return (
              rect.height > 1 &&
              rect.bottom > clip.top &&
              rect.top < clip.bottom
            );
          });
          if (
            visible.length === 0 ||
            visible.some(row => !row.textContent?.trim())
          ) {
            throw new Error('Transcript has blank visible rows');
          }
          const rectangles = visible.map(row =>
            (
              row.closest<HTMLElement>('[data-index]') ?? row
            ).getBoundingClientRect()
          );
          for (let index = 1; index < rectangles.length; index += 1) {
            if (rectangles[index].top - rectangles[index - 1].bottom > 2) {
              throw new Error('Transcript has a gap between visible rows');
            }
          }
          if (
            (viewport.scrollTop > 2 && rectangles[0].top > clip.top + 2) ||
            (viewport.scrollTop + viewport.clientHeight <
              viewport.scrollHeight - 2 &&
              rectangles.at(-1)!.bottom < clip.bottom - 2)
          ) {
            throw new Error(
              'Transcript virtual window does not fill the viewport'
            );
          }
          visibleIds.push(visible.map(row => row.dataset.messageId!));
          if (samples.length > frameCount) {
            resolve();
            return;
          }
          // Bounded movement through dynamic row heights, not whole-list teleports.
          viewport.scrollTop +=
            (direction === 'up' ? -1 : 1) *
            Math.max(12, viewport.clientHeight / 3);
          frameId = requestAnimationFrame(step);
        } catch (error) {
          reject(error);
        }
      };
      frameId = requestAnimationFrame(step);
    });
    const distancePx = Math.max(...positions) - Math.min(...positions);
    if (distancePx < viewport.clientHeight / 2)
      throw new Error('Transcript viewport did not actually scroll');
    return {
      samples,
      positions,
      visibleIds,
      distancePx,
      startTop,
      endTop: viewport.scrollTop,
    };
  } finally {
    cancelAnimationFrame(frameId);
    clearTimeout(watchdog);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('blur', invalidate);
    window.removeEventListener('pagehide', invalidate);
  }
}
