/**
 * Browser-side geometry collector for the presentation gate.
 *
 * Runs via `page.evaluate(collectPresentGeometry, options)`, so it must stay
 * self-contained (no closure over module scope). It records what a viewer
 * sees in the content column: the ink start of every text run and glyph, and
 * every painted box (background or border) that is not full-bleed. Atoms
 * inside a painted box are represented by the box, so a pill's left edge is
 * what is measured, not the label inside it.
 */
export function collectPresentGeometry(options = {}) {
  const { document, window } = /** @type {any} */ (globalThis);
  const columnSelector = options.column ?? 'main#main-content';
  const col = document.querySelector(columnSelector);
  if (!col) return { error: `no content column matched ${columnSelector}` };
  const C = col.getBoundingClientRect();
  const column = {
    left: C.left,
    right: C.right,
    top: C.top,
    bottom: Math.min(C.bottom, window.innerHeight),
    width: C.width,
    height: C.height,
  };
  const bleedSlack = options.bleedSlack ?? 8.5;

  const label = el => {
    const id = el.getAttribute?.('data-testid');
    const cls =
      typeof el.className === 'string'
        ? el.className.trim().split(/\s+/).slice(0, 3).join('.')
        : '';
    return `${el.tagName?.toLowerCase() ?? '#text'}${id ? `[data-testid=${id}]` : ''}${cls ? `.${cls}` : ''}`.slice(
      0,
      120
    );
  };
  const visible = el => {
    // aria-hidden glyphs are still visible ink; only rendering state counts.
    if (!el || el.closest('[hidden],template,noscript')) return false;
    if (
      typeof el.checkVisibility === 'function' &&
      !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    )
      return false;
    // Screen-reader-only content (sr-only: 1px box, clipped) is not ink.
    for (let a = el; a && a !== col; a = a.parentElement) {
      const s = window.getComputedStyle(a);
      const r = a.getBoundingClientRect();
      if (s.position === 'absolute' && r.width <= 1 && r.height <= 1)
        return false;
      if (s.clip && s.clip !== 'auto' && /rect\(0/.test(s.clip)) return false;
    }
    return true;
  };
  const transparent = c =>
    !c || c === 'transparent' || /rgba?\([^)]*,\s*0(\.0+)?\)$/.test(c);
  const colBg = window.getComputedStyle(col).backgroundColor;
  const painted = el => {
    const s = window.getComputedStyle(el);
    const bg =
      (!transparent(s.backgroundColor) && s.backgroundColor !== colBg) ||
      (s.backgroundImage && s.backgroundImage !== 'none');
    const border = ['Top', 'Right', 'Bottom', 'Left'].some(
      side =>
        Number.parseFloat(s[`border${side}Width`]) > 0 &&
        !transparent(s[`border${side}Color`]) &&
        s[`border${side}Style`] !== 'none'
    );
    const fullBorder = ['Top', 'Right', 'Bottom', 'Left'].every(
      side =>
        Number.parseFloat(s[`border${side}Width`]) > 0 &&
        !transparent(s[`border${side}Color`])
    );
    return { bg, border, fullBorder, any: bg || fullBorder };
  };
  const inColumn = r =>
    r.width > 0.5 &&
    r.height > 0.5 &&
    r.right > column.left &&
    r.left < column.right &&
    r.bottom > column.top &&
    r.top < column.bottom;
  const isBleed = r =>
    r.left <= column.left + bleedSlack && r.right >= column.right - bleedSlack;

  // Painted boxes and controls, outermost wins. Table parts are measured by
  // their ink (a header row's fill spans the table, not one cell). A control
  // counts by its box even at rest: its hover/active pill is that box.
  const CONTROL =
    'button,a[href],[role="tab"],[role="button"],[role="menuitem"]';
  const boxes = [];
  for (const el of col.querySelectorAll('*')) {
    if (!visible(el)) continue;
    const display = window.getComputedStyle(el).display;
    if (/^table/.test(display)) continue;
    const r = el.getBoundingClientRect();
    if (!inColumn(r) || isBleed(r)) continue;
    const control = el.matches(CONTROL) && display !== 'inline';
    if (!control && !painted(el).any) continue;
    boxes.push({ el, r });
  }
  const outer = boxes.filter(
    b => !boxes.some(o => o !== b && o.el.contains(b.el))
  );
  const insideBox = node => outer.some(b => b.el.contains(node));

  const atoms = outer.map(({ el, r }) => ({
    kind: 'box',
    left: r.left,
    right: r.right,
    top: r.top,
    bottom: r.bottom,
    label: label(el),
  }));
  const walker = document.createTreeWalker(col, 4);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text || !visible(n.parentElement) || insideBox(n)) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const rects = [...range.getClientRects()].filter(inColumn);
    if (!rects.length) continue;
    const first = rects[0];
    const cell = n.parentElement.closest(
      'th,td,[role="columnheader"],[role="cell"],[role="gridcell"]'
    );
    atoms.push({
      kind: 'text',
      ...(cell
        ? {
            table: cell.matches('th,[role="columnheader"]') ? 'head' : 'body',
            column:
              cell.cellIndex ??
              [...(cell.parentElement?.children ?? [])].indexOf(cell),
            columnLeft: cell.getBoundingClientRect().left,
          }
        : {}),
      text: text.slice(0, 60),
      left: Math.min(...rects.map(x => x.left)),
      right: Math.max(...rects.map(x => x.right)),
      top: first.top,
      bottom: first.bottom,
      label: label(n.parentElement),
    });
  }
  for (const el of col.querySelectorAll(
    'svg,img,video,canvas,input,textarea,select'
  )) {
    if (!visible(el) || insideBox(el) || el.parentElement?.closest('svg'))
      continue;
    const r = el.getBoundingClientRect();
    if (!inColumn(r)) continue;
    atoms.push({
      kind: 'glyph',
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      label: label(el),
    });
  }
  // Text inside a full-bleed row (table rows, list rows) is measured by ink.
  for (const a of atoms) a.bleed = false;

  // Icon tiles: a small painted plate holding one glyph and no text.
  const iconTiles = [];
  for (const { el, r } of boxes) {
    if (!painted(el).any) continue;
    if (r.width > 48 || r.height > 48) continue;
    if (Math.abs(r.width - r.height) > 4) continue;
    if ((el.textContent ?? '').trim()) continue;
    // Artwork (img/video) in a frame is media, not an icon tile.
    if (el.querySelector('img,video,picture')) continue;
    if (el.querySelectorAll('svg').length !== 1) continue;
    const control = el.closest('button,a,[role="button"],[role="tab"]');
    const selected =
      control &&
      ['aria-pressed', 'aria-selected', 'aria-current', 'data-state'].some(a =>
        /^(true|on|active|page)$/.test(control.getAttribute(a) ?? '')
      );
    if (selected) continue;
    iconTiles.push({
      width: Math.round(r.width),
      height: Math.round(r.height),
      label: label(el),
    });
  }

  // Empty states sitting on a plate (border or own surface).
  const emptyStatePlates = [];
  for (const es of col.querySelectorAll('[data-empty-state-presentation]')) {
    if (!visible(es)) continue;
    for (let el = es; el && el !== col; el = el.parentElement) {
      const p = painted(el);
      const r = el.getBoundingClientRect();
      if (isBleed(r)) break;
      if (p.fullBorder || p.bg) {
        emptyStatePlates.push({
          reason: p.fullBorder ? 'bordered card' : 'filled plate',
          label: label(el),
        });
        break;
      }
    }
    for (const inner of es.querySelectorAll('*')) {
      if (!visible(inner) || inner.closest('button,a')) continue;
      const p = painted(inner);
      if (p.fullBorder) {
        emptyStatePlates.push({ reason: 'bordered card', label: label(inner) });
        break;
      }
    }
  }

  const tabs = [];
  for (const el of col.querySelectorAll(
    '[role="tab"],[role="toolbar"] button[aria-pressed]'
  )) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (!inColumn(r)) continue;
    tabs.push({
      text: (el.textContent ?? '').trim().slice(0, 40),
      fontSize: Number.parseFloat(window.getComputedStyle(el).fontSize),
      height: Math.round(r.height),
      label: label(el),
    });
  }

  const devChrome = [];
  const shown = el => {
    const r = el?.getBoundingClientRect?.();
    return Boolean(r && r.width > 1 && r.height > 1);
  };
  for (const el of document.querySelectorAll('[data-testid="dev-toolbar"]'))
    if (shown(el)) devChrome.push('[data-testid="dev-toolbar"]');
  // Next.js dev overlay lives in a shadow root; the host itself is empty.
  for (const host of document.querySelectorAll('nextjs-portal')) {
    const inner = host.shadowRoot?.querySelectorAll(
      '[data-nextjs-toast],[data-next-badge],[data-nextjs-dev-tools-button],[data-issues]'
    );
    if ([...(inner ?? [])].some(shown)) devChrome.push('nextjs-portal');
  }

  // Shell rows in order: the header, then the first toolbar-like row.
  const shellRows = [];
  const header = col.querySelector('[data-testid="dashboard-header"]');
  if (header) {
    const r = header.getBoundingClientRect();
    shellRows.push({
      y: Math.round(r.top - C.top),
      height: Math.round(r.height),
      label: label(header),
    });
    // The first page toolbar below the header is the second shell row.
    const headerBottom = header.getBoundingClientRect().bottom;
    const toolbar = [...col.querySelectorAll('[data-page-toolbar]')]
      .filter(visible)
      .map(el => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.top >= headerBottom - 0.5 && r.height > 0)
      .sort((a, b) => a.r.top - b.r.top)[0];
    if (toolbar)
      shellRows.push({
        y: Math.round(toolbar.r.top - C.top),
        height: Math.round(toolbar.r.height),
        label: label(toolbar.el),
      });
  }

  return {
    schema: 'design-present-geometry/v1',
    url: window.location.pathname + window.location.search,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    column,
    atoms: atoms.map(a => ({
      ...a,
      left: Math.round(a.left * 100) / 100,
      right: Math.round(a.right * 100) / 100,
      top: Math.round(a.top * 100) / 100,
      bottom: Math.round(a.bottom * 100) / 100,
    })),
    iconTiles,
    emptyStatePlates,
    tabs,
    devChrome: [...new Set(devChrome)],
    shellRows,
    horizontalOverflow: Math.max(
      0,
      document.documentElement.scrollWidth - window.innerWidth
    ),
  };
}
