export interface InteractionLatencyMarkHandle {
  readonly id: string;
  readonly name: string;
  readonly startMark: string;
}

let fallbackInteractionIdCounter = 0;

function canUsePerformanceMarks() {
  return (
    typeof performance !== 'undefined' &&
    typeof performance.mark === 'function' &&
    typeof performance.measure === 'function'
  );
}

function createInteractionId(name: string) {
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${(fallbackInteractionIdCounter += 1)}`;

  return `${name}:${suffix}`;
}

export function markInteractionStart(
  name: string
): InteractionLatencyMarkHandle | null {
  if (!canUsePerformanceMarks()) {
    return null;
  }

  const id = createInteractionId(name);
  const startMark = `${id}:start`;
  performance.mark(startMark);

  return {
    id,
    name,
    startMark,
  };
}

export function measureInteractionPoint(
  handle: InteractionLatencyMarkHandle | null,
  point: string
) {
  if (!handle || !canUsePerformanceMarks()) {
    return null;
  }

  const markName = `${handle.id}:${point}`;
  const measureName = `${handle.name}:event-to-${point}`;
  performance.mark(markName);
  performance.measure(measureName, handle.startMark, markName);
  return measureName;
}

export function measureInteractionNextPaint(
  handle: InteractionLatencyMarkHandle | null,
  point = 'first-paint'
) {
  if (!handle || typeof requestAnimationFrame !== 'function') {
    return Promise.resolve(null);
  }

  return new Promise<string | null>(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve(measureInteractionPoint(handle, point));
      });
    });
  });
}
