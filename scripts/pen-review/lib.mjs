/**
 * Pen PROPOSAL review loop: the pure half (no Pen, no network).
 *
 * Every Pen frame marked PROPOSAL is rendered, checked deterministically,
 * judged by a cheap System-1 panel, fixed one top issue at a time and
 * re-rendered until all checks pass and two consecutive judge rounds raise
 * nothing material. Only then is it marked "ready for Tim". This module holds
 * the parts that must be exact and testable:
 *
 * - render guard: renderer noise, identical renders, missing glyphs, blank
 *   text and unloaded image fills fail the render, never reach a judge;
 * - deterministic checks over a frame's resolved node facts: DS tokens only,
 *   type scale, font families, contrast, touch targets, grid and optical
 *   alignment, one primary action, dead ends, copy lint, numeric claims;
 * - the loop decision (fix / quiet / pass / fail) and top-issue selection;
 * - the single-writer lease for the shared Pen canvas.
 *
 * Siblings: render-guard.mjs (render trust), loop-state.mjs (decision,
 * digest, lease). Wiring lives in run.mjs (CLI, sweep, receipts), pen-bridge.mjs (live
 * canvas) and judges.mjs (Clef + Workers AI panel).
 */

// ── Colour ───────────────────────────────────────────────────────────────

/** '#RGB' | '#RRGGBB' | '#RRGGBBAA' -> {r,g,b,a} (0-255, a 0-1) or null. */
export function parseHex(value) {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^#([0-9a-f]{3,8})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
  if (h.length !== 6 && h.length !== 8) return null;
  const n = i => Number.parseInt(h.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
}

/** First visible solid colour of a Pen fill value (string, object or array). */
export function solidFill(fill) {
  if (fill == null) return null;
  if (typeof fill === 'string') return parseHex(fill);
  if (Array.isArray(fill)) {
    for (let i = fill.length - 1; i >= 0; i--) {
      const c = solidFill(fill[i]);
      if (c) return c;
    }
    return null;
  }
  if (typeof fill === 'object') {
    if (fill.enabled === false) return null;
    if (fill.type && fill.type !== 'color') return null;
    const c = parseHex(fill.color ?? fill.value);
    if (c && Number.isFinite(fill.opacity)) c.a *= fill.opacity;
    return c;
  }
  return null;
}

/** True when a fill is (or contains) an image fill. */
export function hasImageFill(fill) {
  if (Array.isArray(fill)) return fill.some(hasImageFill);
  return Boolean(fill && typeof fill === 'object' && fill.type === 'image');
}

export function blend(top, bottom) {
  const a = top.a;
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    a: 1,
  };
}

export function luminance({ r, g, b }) {
  const ch = v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ── Facts ────────────────────────────────────────────────────────────────

/**
 * Facts come from pen-bridge FACTS_SNIPPET: one row per enabled node with
 * absolute bounds, raw props (`r`, unresolved) and resolved props.
 * `inherited` marks nodes inside a canonical shell instance (sidebar, header,
 * bottom nav): those are owned by their masters, so their findings are
 * advisory here and fixed at the master.
 */
export const SHELL_COMPONENT_RE =
  /Sidebar|App Header|Mobile Bottom Nav|Page Toolbar|Right Rail|Persistent Audio Player/i;

/**
 * A proposal's own content is slot overrides with plain ids; nodes reached
 * through a nested shell instance carry `seg/child` path ids. `segRefName` is
 * the component of the path's first segment.
 */
export function indexFacts(facts) {
  const byId = new Map(facts.nodes.map(n => [n.id, n]));
  for (const n of facts.nodes) {
    const viaShell =
      n.id.includes('/') && SHELL_COMPONENT_RE.test(n.segRefName ?? '');
    const isShell =
      SHELL_COMPONENT_RE.test(n.refName ?? '') && !n.id.includes('/');
    n.inherited = Boolean(viaShell || isShell);
  }
  return byId;
}

export function ancestors(byId, node) {
  const out = [];
  let p = node.p ? byId.get(node.p) : null;
  while (p) {
    out.push(p);
    p = p.p ? byId.get(p.p) : null;
  }
  return out;
}

/** Effective opaque background behind a node: composite ancestor fills. */
export function effectiveBackground(
  byId,
  node,
  base = { r: 3, g: 4, b: 6, a: 1 }
) {
  let bg = { ...base };
  for (const a of ancestors(byId, node).reverse()) {
    if (hasImageFill(a.fill)) return null; // text over imagery: judged by eye
    const c = solidFill(a.fill);
    if (!c) continue;
    const alpha = c.a * (Number.isFinite(a.op) ? a.op : 1);
    bg = blend({ ...c, a: alpha }, bg);
  }
  return bg;
}

// ── Deterministic checks ─────────────────────────────────────────────────

const ALLOWED_FAMILIES = new Set(['Inter', 'Satoshi', 'Fira Code']);
const ABBREVIATION = /^[A-Z0-9&/.+·\s-]{1,4}$/;
const BUTTON_NAME =
  /button|cta|action|invite|import|send|primary|secondary|chip|tab|toggle|link|pill|menu item|source|option/i;
const isToken = v => typeof v === 'string' && v.startsWith('$');

function rawColors(raw) {
  const out = [];
  const visit = v => {
    if (v == null) return;
    if (typeof v === 'string') {
      if (v.startsWith('#') && !/^#(?:0{4}|0{8})$/i.test(v)) out.push(v); // fully transparent is not a colour
      return;
    }
    if (Array.isArray(v)) return v.forEach(visit);
    if (typeof v === 'object') {
      if (v.enabled === false || v.type === 'image') return;
      visit(v.color);
      visit(v.value);
      if (Array.isArray(v.stops)) v.stops.forEach(s => visit(s?.color));
    }
  };
  visit(raw);
  return out;
}

const finding = (check, severity, node, message, extra = {}) => ({
  check,
  severity, // 'block' | 'warn'
  node: node ? node.id : null,
  name: node ? (node.nm ?? null) : null,
  text: node?.tx ? String(node.tx).slice(0, 80) : undefined,
  message,
  ...extra,
});

/**
 * Runs every deterministic check. `ctx` = { typeScale:number[], lintCopy?,
 * deadEndRules?, claimPatterns?, compact?:boolean }.
 * Inherited (shell-owned) findings are downgraded to `warn`.
 */
export function runChecks(facts, ctx = {}) {
  const byId = indexFacts(facts);
  const out = [];
  const nodes = facts.nodes.filter(n => n.d > 0);
  const owned = nodes.filter(n => !n.inherited);
  const sev = (n, s) => (n.inherited ? 'warn' : s);
  const texts = nodes.filter(n => n.t === 'text' && String(n.tx ?? '').trim());
  const typeScale = new Set(ctx.typeScale ?? []);

  for (const n of nodes) {
    // DS tokens only: no raw colours on fills or strokes.
    for (const v of [...rawColors(n.r?.fill), ...rawColors(n.r?.stroke)])
      out.push(
        finding(
          'ds-tokens',
          sev(n, 'block'),
          n,
          `raw colour ${v}; use a semantic $token`
        )
      );
    if (n.t === 'text') {
      if (n.r && n.r.fontSize != null && !isToken(n.r.fontSize))
        out.push(
          finding(
            'type-scale',
            sev(n, 'block'),
            n,
            `raw font size ${n.r.fontSize}; use a $type-size token`
          )
        );
      else if (typeScale.size && Number.isFinite(n.fs) && !typeScale.has(n.fs))
        out.push(
          finding(
            'type-scale',
            sev(n, 'block'),
            n,
            `font size ${n.fs} is off the type scale`
          )
        );
      if (n.ff && !ALLOWED_FAMILIES.has(n.ff))
        out.push(
          finding(
            'type-family',
            sev(n, 'block'),
            n,
            `font family ${n.ff} is not Inter, Satoshi or Fira Code`
          )
        );
    }
    // Grid: sub-pixel geometry and off-scale spacing on owned nodes.
    if (!n.inherited && n.t !== 'text') {
      const frac = v =>
        Number.isFinite(v) && Math.abs(v - Math.round(v)) > 0.01;
      if ([n.x, n.y, n.w, n.h].some(frac))
        out.push(
          finding(
            'grid',
            'block',
            n,
            `sub-pixel bounds ${[n.x, n.y, n.w, n.h].map(v => Math.round(v * 100) / 100).join(',')}`
          )
        );
      for (const [k, v] of [
        ['gap', n.r?.gap],
        ['padding', n.r?.padding],
      ]) {
        const vals = (Array.isArray(v) ? v : [v]).filter(
          x => typeof x === 'number'
        );
        for (const x of vals)
          if (x % 2 !== 0)
            out.push(
              finding('grid', 'block', n, `${k} ${x} is off the 4px grid`)
            );
          else if (x % 4 !== 0 && x > 8)
            out.push(
              finding('grid', 'warn', n, `${k} ${x} is not a multiple of 4`)
            );
      }
    }
    if (n.prob && !n.inherited)
      out.push(finding('layout', 'block', n, `node is ${n.prob}`));
  }

  // Contrast (WCAG AA): 4.5:1 body, 3:1 for >=18px or >=14px bold.
  for (const n of texts) {
    const fg = solidFill(n.fill);
    if (!fg) continue;
    const bg = effectiveBackground(byId, n, ctx.canvas);
    if (!bg) continue;
    const ink = blend(
      { ...fg, a: fg.a * (Number.isFinite(n.op) ? n.op : 1) },
      bg
    );
    const ratio = contrastRatio(ink, bg);
    const large = n.fs >= 18 || (n.fs >= 14 && Number(n.fw) >= 600);
    const need = large ? 3 : 4.5;
    if (ratio < need)
      out.push(
        finding(
          'contrast',
          sev(n, 'block'),
          n,
          `contrast ${ratio.toFixed(2)}:1 < ${need}:1`,
          { ratio }
        )
      );
  }

  // ALL CAPS display text (abbreviations allowed).
  for (const n of texts) {
    const s = String(n.tx).trim();
    if (
      /[A-Z]{2}/.test(s) &&
      s === s.toUpperCase() &&
      /[A-Z].*[A-Z].*[A-Z].*[A-Z]/.test(s) &&
      !ABBREVIATION.test(s)
    )
      out.push(
        finding(
          'casing',
          sev(n, 'block'),
          n,
          'ALL CAPS text; use sentence case'
        )
      );
  }

  // Interactive controls: touch targets and the one-primary rule.
  const controls = owned.filter(n => isControl(byId, n));
  const minTarget = ctx.compact ? 44 : 24;
  for (const c of controls)
    if (c.h < minTarget || c.w < minTarget)
      out.push(
        finding(
          'touch-target',
          'block',
          c,
          `target ${Math.round(c.w)}x${Math.round(c.h)} < ${minTarget}px`
        )
      );
  const primaries = controls.filter(c => isPrimaryFill(byId, c, ctx.canvas));
  if (primaries.length > 1)
    out.push(
      finding(
        'one-primary',
        'block',
        primaries[1],
        `${primaries.length} filled primary actions (${primaries.map(p => labelOf(byId, p)).join(' | ')}); keep one`,
        {
          nodes: primaries.map(p => p.id),
        }
      )
    );

  // Optical axis: left edges that miss a shared axis by 1-3px.
  out.push(...nearMissAxes(owned.filter(n => n.t === 'text')));

  // Copy: dead ends, lint floor, numeric claims.
  for (const n of texts.filter(t => !t.inherited)) {
    const s = String(n.tx);
    for (const rule of ctx.deadEndRules ?? [])
      if (rule.pattern.test(s) && !ctx.deadEndTransient?.test(s))
        out.push(
          finding('dead-end', 'block', n, rule.message, { rule: rule.id })
        );
    if (ctx.lintCopy) {
      const res = ctx.lintCopy(s, {
        register: 'jovie-product-ui',
        headline: n.fs >= 20,
      });
      for (const f of res.blocking ?? [])
        out.push(
          finding('copy', 'block', n, `${f.rule}: ${f.message}`, {
            match: f.match,
          })
        );
    }
    for (const p of ctx.claimPatterns ?? [])
      if (p.regex.test(s) && !/\byou(?:r)?\b/i.test(s))
        out.push(
          finding(
            'claims',
            'block',
            n,
            `numeric claim (${p.id}) not bound to the claims ledger`
          )
        );
  }
  return dedupe(out);
}

function labelOf(byId, n) {
  const t = [...byId.values()].find(x => x.t === 'text' && x.p === n.id);
  return t ? String(t.tx).slice(0, 30) : n.nm;
}

export function isControl(byId, n) {
  if (n.t !== 'frame' && n.t !== 'ref' && n.t !== 'instance') return false;
  if (!(n.h >= 12 && n.h <= 64 && n.w <= 420)) return false;
  const kids = [...byId.values()].filter(x => x.p === n.id);
  const hasLabel = kids.some(k => k.t === 'text' || k.t === 'icon_font');
  const named =
    BUTTON_NAME.test(n.nm ?? '') || BUTTON_NAME.test(n.refName ?? '');
  return hasLabel && named;
}

export function isPrimaryFill(byId, n, canvas) {
  const c = solidFill(n.fill);
  if (!c || c.a < 0.9) return false;
  const bg = effectiveBackground(byId, n, canvas) ?? { r: 3, g: 4, b: 6, a: 1 };
  return contrastRatio(c, bg) >= 3 && luminance(c) > 0.4;
}

export function nearMissAxes(textNodes) {
  const counts = new Map();
  for (const n of textNodes) {
    const x = Math.round(n.x);
    counts.set(x, (counts.get(x) ?? 0) + 1);
  }
  const out = [];
  for (const n of textNodes) {
    const x = Math.round(n.x);
    const mine = counts.get(x);
    for (const [axis, c] of counts) {
      const d = Math.abs(axis - x);
      if (d >= 1 && d <= 3 && c >= 3 && c >= mine * 2) {
        out.push(
          finding(
            'optical-axis',
            'block',
            n,
            `left edge ${x} misses the shared axis ${axis} by ${d}px`
          )
        );
        break;
      }
    }
  }
  return out;
}

function dedupe(list) {
  const seen = new Set();
  return list.filter(f => {
    const k = `${f.check}|${f.node}|${f.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
