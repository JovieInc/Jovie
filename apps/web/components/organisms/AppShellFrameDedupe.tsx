'use client';

import { useLayoutEffect } from 'react';

function isNonLayoutHidden(frame: HTMLElement): boolean {
  for (let node: HTMLElement | null = frame; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.contentVisibility === 'hidden'
    ) {
      return true;
    }
  }
  return false;
}

function hasPaintedBox(frame: HTMLElement): boolean {
  const rect = frame.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function collectTestIds(frame: HTMLElement): Set<string> {
  const ids = new Set<string>();
  const own = frame.getAttribute('data-testid');
  if (own) ids.add(own);
  for (const node of frame.querySelectorAll<HTMLElement>('[data-testid]')) {
    const id = node.getAttribute('data-testid');
    if (id) ids.add(id);
  }
  return ids;
}

/** Drop test ids that a painted frame still owns. Unique ids on the hidden
 *  copy stay, and nothing is stripped when every copy is painted. */
function stripDuplicateTestIds(
  hiddenFrame: HTMLElement,
  liveIds: ReadonlySet<string>
): void {
  const nodes = [
    hiddenFrame,
    ...hiddenFrame.querySelectorAll<HTMLElement>('[data-testid]'),
  ];
  for (const node of nodes) {
    const testId = node.getAttribute('data-testid');
    if (testId && liveIds.has(testId)) node.removeAttribute('data-testid');
  }
}

/** A retained shell can stay in the DOM while a second live frame paints.
 *  Playwright's strict `[data-app-shell-frame]` locator then waits on the
 *  hidden copy. Drop the attribute from hidden copies only when a visible
 *  frame remains. Zero-size copies are dropped only once another frame has
 *  a painted box, so a pre-layout pass cannot strip every frame. Test ids
 *  such as `tasks-workspace` are removed from those copies only when a
 *  painted sibling still exposes the same id. */
function releaseHiddenDuplicateFrames(): void {
  const frames = [
    ...document.querySelectorAll<HTMLElement>('[data-app-shell-frame]'),
  ];
  if (frames.length < 2) return;
  const nonLayoutHidden = frames.filter(isNonLayoutHidden);
  const laidOut = frames.filter(frame => !isNonLayoutHidden(frame));
  const painted = laidOut.filter(hasPaintedBox);
  const drop =
    painted.length > 0
      ? frames.filter(frame => !painted.includes(frame))
      : nonLayoutHidden;
  if (drop.length === 0 || drop.length === frames.length) return;
  if (painted.length > 0) {
    const liveIds = new Set<string>();
    for (const frame of painted) {
      for (const id of collectTestIds(frame)) liveIds.add(id);
    }
    for (const frame of drop) stripDuplicateTestIds(frame, liveIds);
  }
  for (const frame of drop) frame.removeAttribute('data-app-shell-frame');
}

let observer: MutationObserver | null = null;
let subscribers = 0;

function subscribeFrameDedupe(): () => void {
  subscribers += 1;
  if (observer === null && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(() => {
      releaseHiddenDuplicateFrames();
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-app-shell-frame', 'hidden'],
    });
  }
  releaseHiddenDuplicateFrames();
  return () => {
    subscribers -= 1;
    if (subscribers === 0 && observer) {
      observer.disconnect();
      observer = null;
    }
  };
}

export function AppShellFrameDedupe() {
  useLayoutEffect(() => {
    const unsubscribe = subscribeFrameDedupe();
    const frame = requestAnimationFrame(releaseHiddenDuplicateFrames);
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, []);
  return null;
}
