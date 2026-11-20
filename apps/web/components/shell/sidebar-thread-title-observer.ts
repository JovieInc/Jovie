/**
 * One shared measurement source for sidebar thread titles.
 *
 * Each thread row needs to re-check whether its title is clipped when the
 * title box resizes, the window resizes, or a web font finishes loading.
 * A row-owned ResizeObserver plus two global listeners per row made a rail
 * toggle do that bookkeeping once per row, per frame. Rows subscribe here
 * instead: one ResizeObserver, one `resize` listener and one font listener
 * for the whole list, torn down when the last row leaves.
 */

type Measure = () => void;

const measures = new Map<Element, Measure>();
let observer: ResizeObserver | null = null;
let listening = false;

function measureAll() {
  for (const measure of Array.from(measures.values())) measure();
}

function handleResize(entries: readonly ResizeObserverEntry[]) {
  for (const entry of entries) measures.get(entry.target)?.();
}

function start() {
  if (listening) return;
  listening = true;
  observer = new ResizeObserver(handleResize);
  globalThis.addEventListener('resize', measureAll);
  document.fonts?.addEventListener('loadingdone', measureAll);
}

function stop() {
  if (!listening) return;
  listening = false;
  observer?.disconnect();
  observer = null;
  globalThis.removeEventListener('resize', measureAll);
  document.fonts?.removeEventListener('loadingdone', measureAll);
}

/**
 * Re-run `measure` whenever `element` may have changed its clipping.
 * Returns the unsubscribe function.
 */
export function observeSidebarThreadTitle(
  element: Element,
  measure: Measure
): () => void {
  start();
  measures.set(element, measure);
  observer?.observe(element);
  // Fonts that were still loading when the row mounted change the width
  // without a resize of the (already truncated) title box.
  void document.fonts?.ready.then(() => {
    if (measures.get(element) === measure) measure();
  });

  return () => {
    if (measures.get(element) !== measure) return;
    measures.delete(element);
    if (measures.size === 0) {
      stop();
      return;
    }
    observer?.unobserve(element);
  };
}
