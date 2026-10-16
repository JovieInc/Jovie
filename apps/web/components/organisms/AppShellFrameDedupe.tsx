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

/** A retained shell can stay in the DOM while a second live frame paints.
 *  Playwright's strict `[data-app-shell-frame]` locator then waits on the
 *  hidden copy. Drop the attribute from hidden copies only when a visible
 *  frame remains. Zero-size copies are dropped only once another frame has
 *  a painted box, so a pre-layout pass cannot strip every frame. */
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
