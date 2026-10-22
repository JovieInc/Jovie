'use client';

import { useLayoutEffect } from 'react';

function isNonLayoutHidden(frame: HTMLElement): boolean {
  for (let node: HTMLElement | null = frame; node; node = node.parentElement) {
    // Author `display: flex` overrides the UA `[hidden] { display: none }`,
    // so a retained shell can stay painted and duplicate `#main-content`.
    if (node.hidden || node.hasAttribute('hidden')) return true;
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

const SHELL_FRAME_ATTR = 'data-app-shell-frame';
/** Stays on a dropped frame after `data-app-shell-frame` is removed so later
 *  mutations in that copy can be cleared without scanning the live frame. */
const SUPPRESSED_SHELL_ATTR = 'data-jovie-shell-suppressed';

function elementFrom(target: Node): Element | null {
  return target instanceof Element ? target : target.parentElement;
}

function shellFrameOf(target: Node): HTMLElement | null {
  return (
    elementFrom(target)?.closest<HTMLElement>(`[${SHELL_FRAME_ATTR}]`) ?? null
  );
}

function suppressedShellOf(target: Node): HTMLElement | null {
  return (
    elementFrom(target)?.closest<HTMLElement>(`[${SUPPRESSED_SHELL_ATTR}]`) ??
    null
  );
}

function nodeCarriesShellFrame(node: Node): boolean {
  if (!(node instanceof Element)) return false;
  return (
    node.hasAttribute(SHELL_FRAME_ATTR) ||
    node.hasAttribute(SUPPRESSED_SHELL_ATTR) ||
    node.querySelector(`[${SHELL_FRAME_ATTR}], [${SUPPRESSED_SHELL_ATTR}]`) !==
      null
  );
}

/** A retained shell can stay in the DOM while a second live frame paints.
 *  Playwright's strict `[data-app-shell-frame]` locator then waits on the
 *  hidden copy. Drop the attribute from hidden copies only when a visible
 *  frame remains. Zero-size copies are dropped only once another frame has
 *  a painted box, so a pre-layout pass cannot strip every frame. Test ids
 *  such as `tasks-workspace` are removed from the copies we drop when a
 *  kept sibling already exposes the same id, including before that sibling
 *  has a painted box. */
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
  const dropSet = new Set(drop);
  const liveIds = new Set<string>();
  for (const frame of frames) {
    if (dropSet.has(frame)) continue;
    for (const id of collectTestIds(frame)) liveIds.add(id);
  }
  for (const frame of drop) {
    frame.setAttribute(SUPPRESSED_SHELL_ATTR, 'true');
    stripDuplicateTestIds(frame, liveIds);
  }
  for (const frame of drop) {
    frame.removeAttribute(SHELL_FRAME_ATTR);
    if (frame.id === 'main-content') frame.removeAttribute('id');
    for (const landmark of frame.querySelectorAll<HTMLElement>(
      '[id="main-content"]'
    )) {
      landmark.removeAttribute('id');
    }
    // Author `display: flex` keeps a `[hidden]` shell painted. Attribute
    // stripping leaves its text in the accessibility tree, so a strict
    // text query sees two copies of the same assistant paragraph.
    clearRetainedShellText(frame);
  }
}

function clearRetainedShellText(frame: HTMLElement): void {
  // Same-value attribute writes still notify MutationObserver in jsdom, and
  // `hidden` is observed. A second write from that notification loops.
  if (!frame.hasAttribute('hidden')) frame.setAttribute('hidden', '');
  if (frame.getAttribute('aria-hidden') !== 'true') {
    frame.setAttribute('aria-hidden', 'true');
  }
  if (!frame.inert) frame.inert = true;
  if (frame.style.getPropertyValue('display') !== 'none') {
    frame.style.setProperty('display', 'none', 'important');
  }
  // Empty copies stay empty. Walking every text node when the live chat
  // commits a message is a 50–150ms long task and misses the round-trip
  // budget (first feedback p50 100ms, usable p95 300ms).
  if (!frame.textContent) return;
  const walker = document.createTreeWalker(frame, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    const text = walker.currentNode as Text;
    if (text.data.length > 0) textNodes.push(text);
  }
  for (const node of textNodes) node.textContent = '';
}

/**
 * Chat commits are childList mutations inside the live frame. Those must not
 * force layout or walk a retained shell. Attribute changes and a frame
 * mounted outside the live shell still run a full pass. Text that reappears
 * inside an already suppressed copy is cleared on that copy only.
 */
function onDocumentMutations(records: MutationRecord[]): void {
  let fullPass = false;
  const suppressed = new Set<HTMLElement>();
  for (const record of records) {
    const suppressedFrame = suppressedShellOf(record.target);
    if (suppressedFrame) {
      suppressed.add(suppressedFrame);
      continue;
    }
    if (record.type === 'attributes') {
      fullPass = true;
      continue;
    }
    if (shellFrameOf(record.target)) continue;
    const nodes = [...record.addedNodes, ...record.removedNodes];
    if (nodes.some(nodeCarriesShellFrame)) fullPass = true;
  }
  if (fullPass) releaseHiddenDuplicateFrames();
  for (const frame of suppressed) clearRetainedShellText(frame);
}

let observer: MutationObserver | null = null;
let subscribers = 0;

function subscribeFrameDedupe(): () => void {
  subscribers += 1;
  if (observer === null && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(records => {
      onDocumentMutations(records);
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
