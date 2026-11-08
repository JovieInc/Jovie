'use client';

import { useEffect } from 'react';

/**
 * The homepage v3 client layer. It renders nothing.
 *
 * 1. Callouts and the catalog connector follow anchors inside the 3D rigs, so
 *    they are placed from projected geometry after layout, on resize and once
 *    fonts load. They move by transform and fade in, never by layout.
 * 2. Motion (skipped under prefers-reduced-motion): fade-ups for sections
 *    below the fold, the hero inspector's scroll parallax, the Orbit light
 *    sweep, and ⌘K typing "releases" then selecting the Releases row.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function anchorRect(id: string): DOMRect | null {
  const anchor = document.querySelector(`[data-hv3-anchor="${id}"]`);
  return anchor ? anchor.getBoundingClientRect() : null;
}

function placeCallouts() {
  for (const callout of document.querySelectorAll<HTMLElement>(
    '[data-hv3-callout]'
  )) {
    const parent = callout.offsetParent;
    const rect = anchorRect(callout.dataset.hv3Callout ?? '');
    if (!parent || !rect || getComputedStyle(callout).display === 'none') {
      continue;
    }
    const box = parent.getBoundingClientRect();
    const x = rect.left + rect.width / 2 - box.left;
    const y = rect.top + rect.height / 2 - box.top;
    const left = callout.classList.contains('hv3-callout--l')
      ? x + 4.5 - callout.offsetWidth
      : x - 4.5;
    const top = Math.round((y - callout.offsetHeight / 2) / 4) * 4;
    callout.style.transform = `translate(${Math.round(left)}px, ${top}px)`;
    callout.dataset.placed = 'true';
  }
}

function drawConnectors() {
  for (const svg of document.querySelectorAll<SVGSVGElement>(
    'svg[data-hv3-connector]'
  )) {
    const [fromId, toId] = (svg.dataset.hv3Connector ?? '').split('>');
    const from = anchorRect(fromId);
    const to = anchorRect(toId);
    const host = svg.parentElement;
    if (!from || !to || !host || getComputedStyle(svg).display === 'none') {
      continue;
    }
    const box = host.getBoundingClientRect();
    const x1 = from.left - box.left;
    const y1 = from.top - box.top;
    const x2 = to.left - box.left;
    const y2 = to.top - box.top;
    const mid = (x1 + x2) / 2;
    svg.setAttribute('width', String(box.width));
    svg.setAttribute('height', String(box.height));
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute(
      'd',
      `M${x1} ${y1} C${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`
    );
    const ends = [
      [x1, y1],
      [x2, y2],
    ].map(([cx, cy]) => {
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', String(cx));
      dot.setAttribute('cy', String(cy));
      dot.setAttribute('r', '4');
      return dot;
    });
    svg.replaceChildren(path, ...ends);
  }
}

function startReveals(): () => void {
  const pending = [
    ...document.querySelectorAll<HTMLElement>('.hv3-reveal'),
  ].filter(element => element.getBoundingClientRect().top > innerHeight);
  for (const element of document.querySelectorAll('.hv3-reveal')) {
    if (!pending.includes(element as HTMLElement))
      element.classList.add('hv3-in');
  }
  const observer = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('hv3-in');
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.15 }
  );
  for (const element of pending) observer.observe(element);
  return () => observer.disconnect();
}

function startParallax(): () => void {
  const lift = document.querySelector<HTMLElement>('[data-hv3-parallax]');
  if (!lift) return () => undefined;
  let frame = 0;
  const update = () => {
    frame = 0;
    lift.style.setProperty('--hv3-par', `${Math.min(scrollY, 900) * -0.05}px`);
  };
  const onScroll = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  addEventListener('scroll', onScroll, { passive: true });
  return () => {
    removeEventListener('scroll', onScroll);
    if (frame) cancelAnimationFrame(frame);
  };
}

function startPaletteTyping(word: string, target: string): () => void {
  const palette = document.querySelector<HTMLElement>('[data-hv3-palette]');
  const query = palette?.querySelector<HTMLElement>('[data-hv3-query]');
  if (!palette || !query) return () => undefined;
  const timers: number[] = [];
  const observer = new IntersectionObserver(
    entries => {
      if (!entries[0]?.isIntersecting) return;
      observer.disconnect();
      let typed = 0;
      query.dataset.typing = 'true';
      query.textContent = '';
      const tick = window.setInterval(() => {
        typed += 1;
        query.textContent = word.slice(0, typed);
        if (typed < word.length) return;
        window.clearInterval(tick);
        timers.push(
          window.setTimeout(() => {
            for (const row of palette.querySelectorAll<HTMLElement>('li')) {
              row.dataset.selected =
                row.dataset.hv3Row === target ? 'true' : 'false';
            }
          }, 260)
        );
      }, 120);
      timers.push(tick);
    },
    { threshold: 0.6 }
  );
  observer.observe(palette);
  return () => {
    observer.disconnect();
    for (const timer of timers) {
      window.clearInterval(timer);
      window.clearTimeout(timer);
    }
  };
}

export function StageMotion({
  paletteQuery,
  paletteTarget,
}: Readonly<{ paletteQuery: string; paletteTarget: string }>) {
  useEffect(() => {
    const layout = () => {
      placeCallouts();
      drawConnectors();
    };
    layout();
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (alive) layout();
    });
    addEventListener('resize', layout);
    const cleanups = [() => removeEventListener('resize', layout)];

    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.documentElement.classList.add('hv3-motion');
      cleanups.push(
        startReveals(),
        startParallax(),
        startPaletteTyping(paletteQuery, paletteTarget),
        () => document.documentElement.classList.remove('hv3-motion')
      );
    }
    return () => {
      alive = false;
      for (const cleanup of cleanups) cleanup();
    };
  }, [paletteQuery, paletteTarget]);
  return null;
}
