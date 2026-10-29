/**
 * Deterministic marketing visual-critic detectors (rubric:
 * docs/design-system/marketing-critic-rubric.json). They read the rendered
 * DOM and computed styles in a real browser: cheap, explainable and precise
 * enough to measure. Model judges cover the classes no DOM rule can see.
 *
 * `collectDomFindings` runs inside the page via `page.evaluate`, so it must
 * stay self-contained (no closure over module scope).
 */

export const DETECTOR_CLASSES = Object.freeze({
  'step-numbering': 'step-n',
  'desktop-touch-copy': 'desktop-dead-end',
  'coming-soon-copy': 'desktop-dead-end',
  'animated-backdrop': 'wallpaper-bg',
  'saturated-gradient-bg': 'wallpaper-bg',
  'saturated-fold-pixels': 'wallpaper-bg',
  'eyebrow-caps': 'eyebrow-caps',
  'icon-tiles': 'icon-tiles',
  'square-focus-ring': 'square-focus-ring',
  'cookie-overlap': 'cookie-overlap',
  'repeated-headings': 'repeated-titles',
  'vertical-dead-band': 'dead-space',
});

export const DETECTOR_IDS = Object.freeze(Object.keys(DETECTOR_CLASSES));

/** Browser-side: every DOM/CSS detector except focus and pixel probes. */
export function collectDomFindings() {
  // Browser globals, typed loosely: this file is type-checked as Node code.
  const { document, window, Element } = /** @type {any} */ (globalThis);
  const getComputedStyle = el => window.getComputedStyle(el);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scrollY = window.scrollY;
  const root = document.querySelector('main') ?? document.body;
  const findings = [];
  const add = (detector, message, examples, measurements = {}) =>
    findings.push({
      detector,
      message,
      examples: examples.slice(0, 5),
      measurements,
    });

  const visible = el => {
    if (!(el instanceof Element)) return false;
    if (el.closest('[hidden],template,noscript')) return false;
    if (
      typeof el.checkVisibility === 'function' &&
      !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    )
      return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  // Site chrome only: a <header>/<footer> inside main is a section header.
  const chrome = el => {
    if (
      el.closest('nav,[role="navigation"],[role="banner"],[role="contentinfo"]')
    )
      return true;
    const box = el.closest('header,footer');
    return Boolean(box && !(root !== document.body && root.contains(box)));
  };
  const ownText = el =>
    Array.from(el.childNodes)
      .filter(n => n.nodeType === 3)
      .map(n => n.textContent)
      .join('') // React splits `0{n}` into adjacent text nodes
      .replace(/\s+/g, ' ')
      .trim();
  const fullText = el => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  const label = el => {
    const cls =
      typeof el.className === 'string'
        ? el.className.trim().split(/\s+/).slice(0, 2).join('.')
        : '';
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''}`;
  };
  const rectOf = el => {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y + scrollY),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  };
  const example = (el, text) => ({
    element: label(el),
    text: (text ?? fullText(el)).slice(0, 80),
    rect: rectOf(el),
  });
  const all = Array.from(root.querySelectorAll('*'));
  const textEls = all.filter(
    el =>
      !chrome(el) &&
      !el.closest('code,pre,table,time,svg') &&
      ownText(el) &&
      visible(el)
  );

  // step-numbering
  {
    const steps = [];
    const numerals = [];
    for (const el of textEls) {
      const t = ownText(el);
      if (t.length > 60) continue;
      if (/^step\s*\d{1,2}\b/i.test(t)) steps.push(example(el, t));
      else if (
        /^0[1-9](?:\s*[./:—-])?$/.test(t) ||
        (/^h[2-4]$/i.test(el.tagName) && /^\d\.\s+\S/.test(t))
      )
        numerals.push(example(el, t));
    }
    if (steps.length > 0 || numerals.length >= 2)
      add(
        'step-numbering',
        `Step numbering on a marketing section (${steps.length + numerals.length} labels).`,
        [...steps, ...numerals],
        {
          count: steps.length + numerals.length,
        }
      );
  }

  // desktop-touch-copy and coming-soon-copy
  {
    const touch = [];
    const soon = [];
    for (const el of textEls) {
      const t = ownText(el);
      if (
        vw >= 1024 &&
        /\b(haptic|tap to|tap and hold|tap the|swipe|pinch to|shake to)\b/i.test(
          t
        )
      )
        touch.push(example(el, t));
      if (
        /\b(coming soon|available soon|launching soon|not available yet)\b/i.test(
          t
        )
      )
        soon.push(example(el, t));
    }
    if (touch.length)
      add(
        'desktop-touch-copy',
        'Touch-only instruction shown on a desktop viewport.',
        touch,
        { count: touch.length }
      );
    if (soon.length)
      add('coming-soon-copy', '"Coming soon" copy is a dead end.', soon, {
        count: soon.length,
      });
  }

  // animated-backdrop
  {
    const hits = [];
    const fold = vw * vh * 2;
    for (const el of document.querySelectorAll('canvas,video')) {
      const r = el.getBoundingClientRect();
      const top = r.top + scrollY;
      if (top > vh * 2 || r.width < 2 || r.height < 2) continue;
      const cs = getComputedStyle(el);
      if (
        cs.display === 'none' ||
        cs.visibility === 'hidden' ||
        Number(cs.opacity) === 0
      )
        continue;
      const area =
        Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) *
        Math.max(0, Math.min(top + r.height, vh * 2) - Math.max(top, 0));
      if (area / fold < 0.2) continue;
      if (el.tagName === 'VIDEO' && (el.controls || !(el.loop && el.muted)))
        continue;
      hits.push({ element: label(el), text: '', rect: rectOf(el) });
    }
    if (hits.length)
      add(
        'animated-backdrop',
        'Canvas or looping video used as a large backdrop.',
        hits,
        { count: hits.length }
      );
  }

  // saturated-gradient-bg
  {
    const hits = [];
    const colourRe = /(rgba?|oklch|hsla?|color)\(([^()]*)\)/g;
    const saturated = (fn, body) => {
      const parts = body
        .replace(/,/g, ' ')
        .replace('/', ' / ')
        .split(/\s+/)
        .filter(Boolean);
      const alphaIdx = parts.indexOf('/');
      let alpha =
        alphaIdx >= 0
          ? parseFloat(parts[alphaIdx + 1])
          : fn.endsWith('a') && parts.length >= 4
            ? parseFloat(parts[3])
            : 1;
      if (String(parts[alphaIdx + 1] ?? '').endsWith('%')) alpha /= 100;
      if (!(alpha >= 0.25)) return false;
      const num = s =>
        String(s).endsWith('%') ? parseFloat(s) / 100 : parseFloat(s);
      if (fn === 'oklch') {
        const L = num(parts[0]);
        const C = parseFloat(parts[1]);
        return C >= 0.1 && L >= 0.3 && L <= 0.9;
      }
      let r, g, b;
      if (fn === 'color') {
        if (parts[0] !== 'srgb') return false;
        [r, g, b] = parts.slice(1, 4).map(Number);
      } else if (fn.startsWith('rgb')) {
        [r, g, b] = parts
          .slice(0, 3)
          .map(v => num(v) * (String(v).endsWith('%') ? 1 : 1 / 255));
      } else
        return (
          num(parts[1]) >= 0.45 && num(parts[2]) >= 0.2 && num(parts[2]) <= 0.8
        );
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      if (max === min) return false;
      const s =
        l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
      return s >= 0.45 && l >= 0.2 && l <= 0.8;
    };
    for (const el of document.body.querySelectorAll('*')) {
      if (el.closest('svg')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < vw * 0.5 || r.height < 200) continue;
      const bg = getComputedStyle(el).backgroundImage;
      if (!bg || bg === 'none' || !bg.includes('gradient')) continue;
      const stops = [...bg.matchAll(colourRe)].filter(m =>
        saturated(m[1], m[2])
      );
      if (stops.length && visible(el))
        hits.push({ element: label(el), text: stops[0][0], rect: rectOf(el) });
    }
    if (hits.length)
      add(
        'saturated-gradient-bg',
        'Large background uses a saturated colour gradient.',
        hits,
        { count: hits.length }
      );
  }

  // eyebrow-caps
  {
    const hits = [];
    for (const el of textEls) {
      if (el.closest('a,button,label,[role="button"]')) continue;
      const t = fullText(el);
      if (t.length < 3 || t.length > 32 || !/[A-Za-z]{3}/.test(t)) continue;
      const cs = getComputedStyle(el);
      const upper =
        cs.textTransform === 'uppercase' ||
        (t === t.toUpperCase() && /[A-Z]{3}/.test(t));
      if (!upper) continue;
      const fs = parseFloat(cs.fontSize) || 16;
      const ls = parseFloat(cs.letterSpacing) || 0;
      if (fs > 15 && ls < fs * 0.04) continue;
      const box = el.getBoundingClientRect();
      const heading = Array.from(
        el.parentElement?.parentElement?.querySelectorAll('h1,h2,h3') ?? []
      ).find(h => {
        const hr = h.getBoundingClientRect();
        return (
          hr.top >= box.bottom - 2 && hr.top - box.bottom < 80 && visible(h)
        );
      });
      if (heading) hits.push(example(el, t));
    }
    if (hits.length)
      add('eyebrow-caps', 'All-caps eyebrow label above a heading.', hits, {
        count: hits.length,
      });
  }

  // icon-tiles
  {
    const hits = [];
    for (const el of all) {
      if (chrome(el) || el.closest('a,button,[role="button"],label')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.width > 72 || Math.abs(r.width - r.height) > 4)
        continue;
      const kids = Array.from(el.children);
      if (kids.length !== 1 || fullText(el)) continue;
      const icon = kids[0].matches('svg,img')
        ? kids[0]
        : kids[0].querySelector('svg,img');
      if (!icon) continue;
      const ir = icon.getBoundingClientRect();
      if (ir.width > r.width * 0.75) continue;
      const cs = getComputedStyle(el);
      const filled =
        cs.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
        cs.backgroundColor !== 'transparent';
      const bordered =
        parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none';
      if ((filled || bordered) && visible(el))
        hits.push({ element: label(el), text: '', rect: rectOf(el) });
    }
    if (hits.length >= 3)
      add('icon-tiles', `${hits.length} decorative icon tiles.`, hits, {
        count: hits.length,
      });
  }

  // cookie-overlap
  {
    const banner = Array.from(document.querySelectorAll('body *')).find(el => {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') return false;
      const r = el.getBoundingClientRect();
      return (
        r.width >= 200 &&
        r.height >= 40 &&
        /cookie/i.test(fullText(el)) &&
        visible(el)
      );
    });
    if (banner) {
      const br = banner.getBoundingClientRect();
      const hits = [];
      for (const el of root.querySelectorAll(
        'h1,h2,h3,a,button,img,video,picture,p'
      )) {
        if (banner.contains(el) || chrome(el) || !visible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.top >= vh || r.bottom <= 0) continue;
        const ix = Math.max(
          0,
          Math.min(r.right, br.right) - Math.max(r.left, br.left)
        );
        const iy = Math.max(
          0,
          Math.min(r.bottom, br.bottom) - Math.max(r.top, br.top)
        );
        if ((ix * iy) / (r.width * r.height) >= 0.2) hits.push(example(el));
      }
      if (hits.length)
        add(
          'cookie-overlap',
          'Cookie banner covers first-viewport content.',
          hits,
          { count: hits.length }
        );
    }
  }

  // repeated-headings
  {
    const norm = t =>
      t
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    const seen = new Map();
    for (const h of root.querySelectorAll('h1,h2,h3')) {
      if (chrome(h) || !visible(h)) continue;
      const key = norm(fullText(h));
      if (key.length < 4) continue;
      seen.set(key, [...(seen.get(key) ?? []), example(h)]);
    }
    const ctas = new Map();
    for (const a of root.querySelectorAll('a,button')) {
      if (chrome(a) || !visible(a)) continue;
      const key = norm(fullText(a));
      if (key.split(' ').length < 2 || key.length > 40) continue;
      ctas.set(key, [...(ctas.get(key) ?? []), example(a)]);
    }
    const dupes = [...seen.values()].filter(v => v.length >= 2).map(v => v[0]);
    const spam = [...ctas.values()].filter(v => v.length >= 4).map(v => v[0]);
    if (dupes.length || spam.length)
      add(
        'repeated-headings',
        'Heading or call to action repeated on one page.',
        [...dupes, ...spam],
        {
          headings: dupes.length,
          ctas: spam.length,
        }
      );
  }

  // vertical-dead-band
  {
    const spans = [];
    const content = root.querySelectorAll(
      'h1,h2,h3,h4,h5,h6,p,li,a,button,input,textarea,select,img,svg,video,picture,figure,blockquote,span,label,dt,dd,td,th'
    );
    for (const el of content) {
      if (el.tagName !== 'svg' && el.closest('svg')) continue;
      if (!visible(el)) continue;
      if (/^(span|a|label)$/i.test(el.tagName) && !ownText(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 8 || (el.tagName === 'svg' && r.width < 16)) continue;
      spans.push([r.top + scrollY, r.bottom + scrollY]);
    }
    spans.sort((a, b) => a[0] - b[0]);
    let worst = { gap: 0, from: 0 };
    let end = spans[0]?.[1] ?? 0;
    for (const [top, bottom] of spans.slice(1)) {
      if (top - end > worst.gap) worst = { gap: top - end, from: end };
      end = Math.max(end, bottom);
    }
    const limit = Math.max(360, vh * 0.5);
    if (worst.gap > limit)
      add(
        'vertical-dead-band',
        `${Math.round(worst.gap)}px band with no content (limit ${Math.round(limit)}px).`,
        [
          {
            element: 'main',
            text: '',
            rect: {
              x: 0,
              y: Math.round(worst.from),
              w: vw,
              h: Math.round(worst.gap),
            },
          },
        ],
        { gap: Math.round(worst.gap), limit: Math.round(limit) }
      );
  }

  return findings;
}

/** Browser-side probe of the focused element after a keyboard Tab. */
export function probeFocusRing() {
  // Browser globals, typed loosely: this file is type-checked as Node code.
  const { document, window } = /** @type {any} */ (globalThis);
  const getComputedStyle = el => window.getComputedStyle(el);
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const cs = getComputedStyle(el);
  if (cs.outlineStyle === 'none' || !(parseFloat(cs.outlineWidth) > 0))
    return null;
  if (parseFloat(cs.borderTopLeftRadius) >= 2) return null;
  if (
    parseFloat(cs.borderTopWidth) > 0 &&
    cs.borderTopStyle !== 'none' &&
    cs.borderTopColor !== 'rgba(0, 0, 0, 0)'
  )
    return null;
  const r = el.getBoundingClientRect();
  let node = el.parentElement;
  for (
    let depth = 0;
    node && depth < 3;
    depth += 1, node = node.parentElement
  ) {
    const ps = getComputedStyle(node);
    const radius = parseFloat(ps.borderTopLeftRadius);
    const surfaced =
      (parseFloat(ps.borderTopWidth) > 0 && ps.borderTopStyle !== 'none') ||
      (ps.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
        ps.backgroundColor !== 'transparent');
    if (radius >= 6 && surfaced) {
      const pr = node.getBoundingClientRect();
      if (
        r.left >= pr.left - 1 &&
        r.right <= pr.right + 1 &&
        r.top >= pr.top - 1 &&
        r.bottom <= pr.bottom + 1
      ) {
        const cls =
          typeof el.className === 'string'
            ? el.className.trim().split(/\s+/).slice(0, 2).join('.')
            : '';
        return {
          element: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''}`,
          text: (
            el.getAttribute('aria-label') ??
            el.getAttribute('placeholder') ??
            el.textContent ??
            ''
          )
            .trim()
            .slice(0, 80),
          rect: {
            x: Math.round(r.x),
            y: Math.round(r.y + window.scrollY),
            w: Math.round(r.width),
            h: Math.round(r.height),
          },
          wrapperRadius: radius,
        };
      }
    }
  }
  return null;
}

/** Browser-side: share of saturated pixels in a PNG data URL. */
export async function saturatedShare(dataUrl) {
  // Browser globals, typed loosely: this file is type-checked as Node code.
  const { document, Image } = /** @type {any} */ (globalThis);
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 480 / img.width);
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let hit = 0;
  for (let i = 0; i < data.length; i += 4) {
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    if (max / 255 >= 0.3 && (max - min) / max >= 0.5) hit += 1;
  }
  return hit / (data.length / 4);
}

/**
 * Run every detector on a page that is already at the target route and
 * viewport. Returns findings tagged with detector and class.
 */
export async function runDetectors(page, options = {}) {
  const pixelShareMax = options.pixelShareMax ?? 0.02;
  const focusTabs = options.focusTabs ?? 80;
  const out = [];
  const tag = f => ({ ...f, class: DETECTOR_CLASSES[f.detector] });

  // Reveal scroll-triggered content, then return to the top.
  await page.evaluate(async () => {
    const { document, window } = /** @type {any} */ (globalThis);
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 40));
    }
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 120));
  });

  const fold = await page.screenshot({ type: 'png' });
  const share = await page.evaluate(
    saturatedShare,
    `data:image/png;base64,${fold.toString('base64')}`
  );
  if (share > pixelShareMax)
    out.push(
      tag({
        detector: 'saturated-fold-pixels',
        message: `${Math.round(share * 100)}% of first-viewport pixels are saturated (limit ${Math.round(pixelShareMax * 100)}%).`,
        examples: [],
        measurements: { share: Number(share.toFixed(4)), limit: pixelShareMax },
      })
    );

  out.push(...(await page.evaluate(collectDomFindings)).map(tag));

  const rings = [];
  const seen = new Set();
  for (let i = 0; i < focusTabs; i += 1) {
    await page.keyboard.press('Tab');
    const hit = await page.evaluate(probeFocusRing);
    if (hit && !seen.has(hit.element + hit.rect.y)) {
      seen.add(hit.element + hit.rect.y);
      rings.push(hit);
    }
  }
  await page.evaluate(() =>
    /** @type {any} */ (globalThis).window.scrollTo(0, 0)
  );
  if (rings.length)
    out.push(
      tag({
        detector: 'square-focus-ring',
        message: 'Square focus outline inside a rounded field.',
        examples: rings.slice(0, 5),
        measurements: { count: rings.length },
      })
    );
  return out;
}
