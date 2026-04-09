'use client';

import { type RefObject, useEffect, useRef } from 'react';

const HOME_LINK_LABEL = 'Go to homepage';
const NORMALIZED_ATTR = 'data-jovie-home-link-label';

function hasAccessibleName(anchor: HTMLAnchorElement): boolean {
  const ariaLabel =
    anchor.getAttribute(NORMALIZED_ATTR) === 'true'
      ? null
      : anchor.getAttribute('aria-label')?.trim();
  if (ariaLabel) {
    return true;
  }

  const labelledBy = anchor.getAttribute('aria-labelledby');
  if (labelledBy) {
    for (const id of labelledBy.split(/\s+/)) {
      const text = document.getElementById(id)?.textContent?.trim();
      if (text) {
        return true;
      }
    }
  }

  const title = anchor.getAttribute('title')?.trim();
  if (title) {
    return true;
  }

  const imageAlt = anchor
    .querySelector('img[alt]')
    ?.getAttribute('alt')
    ?.trim();
  if (imageAlt) {
    return true;
  }

  return anchor.textContent?.trim().length !== 0;
}

function isHomepageHref(anchor: HTMLAnchorElement): boolean {
  try {
    const url = new URL(anchor.href, globalThis.location.href);
    return url.origin === globalThis.location.origin && url.pathname === '/';
  } catch {
    return false;
  }
}

function normalizeHomeLinks(root: HTMLElement) {
  for (const node of root.querySelectorAll('a[href]')) {
    if (!(node instanceof HTMLAnchorElement)) {
      continue;
    }

    const wasNormalized = node.getAttribute(NORMALIZED_ATTR) === 'true';

    if (!isHomepageHref(node)) {
      if (wasNormalized) {
        node.removeAttribute('aria-label');
        node.removeAttribute(NORMALIZED_ATTR);
      }
      continue;
    }

    if (hasAccessibleName(node)) {
      if (wasNormalized) {
        node.removeAttribute('aria-label');
        node.removeAttribute(NORMALIZED_ATTR);
      }
      continue;
    }

    node.setAttribute('aria-label', HOME_LINK_LABEL);
    node.setAttribute(NORMALIZED_ATTR, 'true');
  }
}

export function useNormalizeClerkHomeLink(
  containerRef: RefObject<HTMLElement | null>
) {
  const observedRootRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) {
      return;
    }

    if (observedRootRef.current === root) {
      return;
    }

    observerRef.current?.disconnect();

    const run = () => normalizeHomeLinks(root);
    run();

    const observer = new MutationObserver(run);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label', 'aria-labelledby', 'href', 'title'],
    });

    observedRootRef.current = root;
    observerRef.current = observer;

    return () => {
      if (observerRef.current === observer) {
        observer.disconnect();
        observerRef.current = null;
      }

      if (observedRootRef.current === root) {
        observedRootRef.current = null;
      }
    };
  });
}
