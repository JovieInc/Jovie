import { expect, type Page } from '@playwright/test';
import {
  collectScrollFrames,
  countMissedPresentationSlots,
} from './chat-scroll-frames';

export const SCROLL_SELECTOR = '[data-testid="chat-message-scroll"]';
export const SCROLL_REFRESH_PROFILE = {
  refreshHz: 60,
  toleranceMs: 1,
} as const;

/** Read the first viewport-intersecting message, not an overscanned row. */
export function readScrollAnchor() {
  const viewport = document.querySelector<HTMLElement>(
    '[data-testid="chat-message-scroll"]'
  )!;
  const clip = viewport.getBoundingClientRect();
  const row = Array.from(
    viewport.querySelectorAll<HTMLElement>('[data-message-id]')
  ).find(row => {
    const rect = row.getBoundingClientRect();
    return rect.height > 1 && rect.bottom > clip.top && rect.top < clip.bottom;
  });
  if (!row) throw new Error('Missing visible transcript anchor');
  return {
    id: row.dataset.messageId!,
    index: Number(row.closest<HTMLElement>('[data-index]')?.dataset.index),
    offset: row.getBoundingClientRect().top - clip.top,
  };
}

export async function scoredScroll(
  page: Page,
  direction: 'up' | 'down',
  tailIds: readonly string[] = []
) {
  const result = await page.evaluate(collectScrollFrames, {
    selector: SCROLL_SELECTOR,
    direction,
    frameCount: 90,
  });
  const rank = (id: string) => {
    if (id.startsWith('history-')) return Number(id.slice(8));
    const index = tailIds.indexOf(id);
    if (index < 0) throw new Error(`Unexpected transcript row ${id}`);
    return 1_000_000 + index;
  };
  for (const ids of result.visibleIds) {
    const ranks = ids.map(rank);
    expect(new Set(ids).size, 'visible row IDs are unique').toBe(ids.length);
    expect(ranks, 'all visible rows are chronological').toEqual(
      [...ranks].sort((a, b) => a - b)
    );
    const history = ids.filter(id => id.startsWith('history-'));
    for (let index = 1; index < history.length; index += 1) {
      expect(
        rank(history[index]) - rank(history[index - 1]),
        'visible history has no holes'
      ).toBe(1);
    }
  }
  const firstRank = rank(result.visibleIds[0][0]);
  const lastRank = rank(result.visibleIds.at(-1)![0]);
  expect(
    direction === 'up' ? lastRank < firstRank : lastRank > firstRank,
    'scrolling advances the visible transcript window'
  ).toBe(true);
  const timing = countMissedPresentationSlots({
    profile: SCROLL_REFRESH_PROFILE,
    samples: result.samples,
  });
  return {
    ...timing,
    samples: result.samples,
    visibleIds: result.visibleIds,
    distancePx: result.distancePx,
    startTop: result.startTop,
    endTop: result.endTop,
  };
}
