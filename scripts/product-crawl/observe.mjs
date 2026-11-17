// What the crawler measures inside each page it loads: layout shifts and
// what moved, inserts, paint, long tasks and the longest animation frame.
import { SURFACE } from './overlay-walk.mjs';
import { verticalMove } from './ready-gate.mjs';

// Runs in the page, so it is a string: these scripts type-check as Node.
export const OBSERVE = `
  window.__crawl = { cls: 0, lcp: 0, longest: 0, shifts: {}, moves: {}, added: [] };
  const watch = (type, fn) => new PerformanceObserver(l => l.getEntries().forEach(fn)).observe({ type, buffered: true });
  // Names the elements that moved, so a layout-shift finding says what to fix.
  const label = n => {
    if (!n || n.nodeType !== 1) return null;
    const cls = typeof n.className === 'string' ? n.className.split(' ').filter(Boolean).slice(0, 2).join('.') : '';
    const testId = n.getAttribute('data-testid');
    return (n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (testId ? '[data-testid=' + testId + ']' : '') + (cls ? '.' + cls : '')).slice(0, 100);
  };
  const verticalMove = ${verticalMove};
  watch('layout-shift', e => {
    if (e.hadRecentInput) return;
    window.__crawl.cls += e.value;
    for (const s of e.sources ?? []) {
      const k = label(s.node);
      if (!k) continue;
      window.__crawl.shifts[k] = (window.__crawl.shifts[k] ?? 0) + e.value;
      // The first vertical move says how far and when, so the cause can be found.
      const dy = verticalMove(s.previousRect, s.currentRect);
      if (dy !== undefined && !window.__crawl.moves[k])
        window.__crawl.moves[k] = {
          dy,
          atMs: Math.round(e.startTime),
          // What was inserted just before, sized as the shift happened.
          added: window.__crawl.added
            .filter(x => x.t >= e.startTime - 500 && x.n.isConnected)
            .map(x => ({ node: label(x.n), atMs: Math.round(x.t), h: Math.round(x.n.getBoundingClientRect().height) }))
            .filter(x => x.node && x.h >= 24),
        };
    }
  });
  // Elements inserted in the last second, so a shift can name what appeared
  // just before it (the usual cause: a late block pushing the rest down).
  // Only a recent window is kept, so a large first parse cannot crowd out
  // later inserts.
  new MutationObserver(records => {
    const t = performance.now();
    const added = window.__crawl.added;
    let old = 0;
    while (old < added.length && added[old].t < t - 1000) old++;
    if (old) added.splice(0, old);
    for (const r of records)
      for (const n of r.addedNodes)
        if (n.nodeType === 1) added.push({ n, t });
  }).observe(document, { childList: true, subtree: true });
  watch('largest-contentful-paint', e => { window.__crawl.lcp = Math.max(window.__crawl.lcp, e.startTime); });
  watch('longtask', e => { window.__crawl.longest = Math.max(window.__crawl.longest, e.duration); });
  // The longest animation frame, with the scripts that ran in it, so a
  // frozen-frame finding says what blocked the main thread.
  watch('long-animation-frame', e => {
    if (e.duration <= (window.__crawl.frame?.ms ?? 0)) return;
    const file = u => (u || '').split('?')[0].split('/').pop().slice(0, 80);
    window.__crawl.frame = {
      ms: Math.round(e.duration),
      atMs: Math.round(e.startTime),
      layoutMs: Math.round(e.styleAndLayoutDuration ?? 0),
      scripts: [...(e.scripts ?? [])]
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 3)
        .map(x => ({ src: file(x.sourceURL), fn: (x.sourceFunctionName || '').slice(0, 60), invoker: /^https?:/.test(x.invoker || '') ? file(x.invoker) : (x.invoker || x.invokerType || '').slice(0, 80), ms: Math.round(x.duration) })),
    };
  });
`;
export const MEASURE = `({ ...window.__crawl, added: undefined,
  text: document.body?.innerText ?? '',
  overlaySurface: ${SURFACE},
  overflow: document.documentElement.scrollWidth > window.innerWidth + 1 })`;
