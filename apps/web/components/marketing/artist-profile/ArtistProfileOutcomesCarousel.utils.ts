export interface OutcomeCardRect {
  readonly left: number;
  readonly width: number;
}

export function clampOutcomeIndex(index: number, cardCount: number): number {
  if (cardCount <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(cardCount - 1, index));
}

export function getNearestOutcomeIndex(
  cardRects: readonly OutcomeCardRect[],
  scrollLeft: number,
  viewportWidth: number
): number {
  if (cardRects.length === 0) {
    return 0;
  }

  const viewportCenter = scrollLeft + viewportWidth / 2;
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const [index, rect] of cardRects.entries()) {
    const cardCenter = rect.left + rect.width / 2;
    const distance = Math.abs(cardCenter - viewportCenter);

    if (distance < nearestDistance) {
      nearestIndex = index;
      nearestDistance = distance;
    }
  }

  return nearestIndex;
}
