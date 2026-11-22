/** Accent pack detectors: JSX roles, weight, CSS, and the scanSource entry point. Pure: source text in, violation ids out. */

import {
  accentOf,
  colorFamilies,
  FAMILY_ACCENT,
} from './accent-pack-color.mjs';
import {
  DATA_VIZ_PATH,
  GREEN_RED_MIN_SET,
  STATUS_NAME,
  STATUS_TAG,
} from './accent-pack-config.mjs';
import {
  ACCENT_NAME,
  bgAccents,
  gradientFamilies,
  gradientIds,
  isStatusRole,
  offPackLiteralIds,
  offPackTailwindIds,
  offPackVarIds,
  rotationIds,
  STOP,
  strTokens,
} from './accent-pack-detect-a.mjs';
import {
  arrayLiterals,
  jsxElements,
  matchClose,
  tokenize,
} from './accent-pack-tokens.mjs';

const CONTAINER_TAG =
  /^(div|section|article|aside|main|header|footer|li|ul|nav|button|a|Card\w*|Panel\w*|Section\w*|Button\w*|Container\w*|Surface\w*)$/;
const DOT_SIZE =
  /(?<![\w-])(?:size|w|h)-(?:0\.5|1|1\.5|2|2\.5|3|\[(?:[0-9]|1[0-2])px\])(?![\w.])/;

function elementInfo(el) {
  const strs = strTokens(el.toks);
  const classes = strs.map(s => s.v).join(' ');
  /** @type {Array<Record<string, any>>} */
  const accents = [];
  const solids = [];
  for (const bg of bgAccents(classes)) {
    accents.push(bg);
    const soft =
      bg.soft ||
      (bg.opacity &&
        Number.parseInt(bg.opacity, 10) <= 12 &&
        /^\d+$/.test(bg.opacity));
    if (!soft) solids.push(bg);
  }
  for (const m of classes.matchAll(STOP)) {
    if (/(^|:)(hover|focus|active|group-hover|disabled)/.test(m[1])) continue;
    const fams = colorFamilies(m[3].replace(/_/g, ' '));
    for (const family of fams)
      accents.push({
        family,
        opacity: '',
        soft: true,
        step: '',
        token: m[0],
        gradient: true,
      });
  }
  // data-accent attribute
  for (let k = 0; k < el.toks.length - 2; k++) {
    const tk = el.toks[k];
    if (
      tk.t === 'id' &&
      tk.v === 'data-accent' &&
      el.toks[k + 1].v === '=' &&
      el.toks[k + 2].t === 'str'
    ) {
      const a = ACCENT_NAME[el.toks[k + 2].v.trim().toLowerCase()];
      if (a)
        accents.push({
          family: Object.keys(FAMILY_ACCENT).find(f => FAMILY_ACCENT[f] === a),
          opacity: '',
          soft: true,
          step: '',
          token: 'data-accent',
          attr: true,
        });
    }
    // style={{ background: '...' }}
    if (
      tk.t === 'id' &&
      /^background(Color|Image)?$/.test(tk.v) &&
      el.toks[k + 1].v === ':'
    ) {
      for (
        let m = k + 2;
        m < Math.min(k + 12, el.toks.length) && el.toks[m].v !== ',';
        m++
      ) {
        if (el.toks[m].t !== 'str') continue;
        const v = el.toks[m].v;
        if (/gradient\(/.test(v)) continue;
        const fam = colorFamilies(v)[0];
        if (!fam) continue;
        const soft =
          /subtle|soft|tint|rgba?\([^)]*,\s*0?\.(?:0\d?|1[0-2]?)\)|\/\s*0?\.?(?:0\d?|1[0-2]?)%?\)/.test(
            v
          );
        const item = {
          family: fam,
          opacity: '',
          soft,
          step: '',
          token: `style:${v.slice(0, 24)}`,
        };
        accents.push(item);
        if (!soft) solids.push(item);
      }
    }
  }
  const status = isStatusRole(el.toks) || STATUS_TAG.test(el.tag);
  const dot =
    DOT_SIZE.test(classes) || /dot/i.test(classes) || /dot/i.test(el.tag);
  return { tag: el.tag, accents, solids, status, dot, classes };
}

export function jsxIds(toks, file, { dataViz }) {
  const ids = new Set();
  const infos = jsxElements(toks).map(el => ({ el, ...elementInfo(el) }));
  const gradientFlagged = new Set();
  for (const info of infos) {
    if (gradientFamilies(info.classes).length) gradientFlagged.add(info);
  }
  const fileAccents = new Map(); // accent -> count (hardcoded, non-status, non-gradient-flagged)
  const peerFills = [];
  let hasGreenRedDecor = null;
  for (const info of infos) {
    if (!info.accents.length) continue;
    const rot = new Set(
      info.accents
        .map(a => a.family)
        .filter(f => f !== 'red' && f !== 'green' && f !== null)
    );
    if (!gradientFlagged.has(info) && rot.size >= 2 && !info.status)
      ids.add(
        `multi-accent-item:${file}:${[...rot].map(accentOf).sort().join('+')}`
      );
    // (g) solid fills on containers
    if (
      !info.status &&
      !dataViz &&
      !info.dot &&
      CONTAINER_TAG.test(info.tag) &&
      info.solids.length
    ) {
      const fams = [...new Set(info.solids.map(s => accentOf(s.family)))]
        .sort()
        .join('+');
      ids.add(`solid-accent-fill:${file}:${info.tag}:${fams}`);
    }
    if (info.status) continue;
    const fams = new Set(info.accents.map(a => a.family));
    for (const f of fams) {
      const a = accentOf(f);
      fileAccents.set(a, (fileAccents.get(a) ?? 0) + 1);
      if (f === 'green' || f === 'red')
        hasGreenRedDecor = hasGreenRedDecor
          ? hasGreenRedDecor.add(a)
          : new Set([a]);
    }
    if (
      fams.size === 1 &&
      info.accents.length === 1 &&
      !info.accents[0].attr &&
      !info.accents[0].gradient
    )
      peerFills.push({ accent: accentOf([...fams][0]), ...info.accents[0] });
  }
  const distinct = [...fileAccents.keys()];
  if (hasGreenRedDecor && distinct.length < GREEN_RED_MIN_SET)
    for (const a of hasGreenRedDecor)
      ids.add(`mint-red-min-set:${file}:${a}:${distinct.length}-accents`);
  const rotDistinct = distinct.filter(a => a !== 'red' && a !== 'mint');
  const hasItemFlag = [...ids].some(id => id.startsWith('multi-accent-item:'));
  if (!dataViz && !hasItemFlag && rotDistinct.length >= 2)
    ids.add(`multi-accent-file:${file}:${rotDistinct.sort().join('+')}`);
  // (f) equal weight among hardcoded peers of different accents
  const sig = p =>
    `${p.step || '-'}/${p.opacity || '-'}/${p.soft ? 'soft' : 'hard'}`;
  const peerAccents = new Set(peerFills.map(p => p.accent));
  if (peerAccents.size >= 2 && new Set(peerFills.map(sig)).size > 1)
    ids.add(
      `unequal-weight:${file}:jsx-peers:${[...new Set(peerFills.map(sig))].sort().join('|')}`
    );
  return [...ids];
}

/* (f) arrays and maps of class strings used as peers */
export function weightIds(toks, file) {
  const ids = new Set();
  const groups = [];
  for (const arr of arrayLiterals(toks))
    if (!STATUS_NAME.test(arr.name))
      groups.push({
        name: arr.name || 'array',
        items: arr.elements.map(el =>
          strTokens(el)
            .map(s => s.v)
            .join(' ')
        ),
      });
  for (let k = 0; k < toks.length; k++) {
    if (
      toks[k].v !== '{' ||
      toks[k].t !== 'p' ||
      (toks[k - 1]?.v !== '=' &&
        toks[k - 1]?.v !== ':' &&
        toks[k - 1]?.v !== '(')
    )
      continue;
    const end = matchClose(toks, k);
    if (end === -1 || end - k > 400) continue;
    const inner = toks.slice(k + 1, end);
    const props = [];
    let cur = [];
    let depth = 0;
    for (const it of inner) {
      if (it.t === 'p' && '([{'.includes(it.v)) depth++;
      if (it.t === 'p' && ')]}'.includes(it.v)) depth--;
      if (it.t === 'p' && it.v === ',' && depth === 0) {
        props.push(cur);
        cur = [];
        continue;
      }
      cur.push(it);
    }
    if (cur.length) props.push(cur);
    const keyed = props.filter(
      p =>
        p[0] &&
        (p[0].t === 'id' || p[0].t === 'str') &&
        p[1]?.v === ':' &&
        ACCENT_NAME[String(p[0].v).toLowerCase()]
    );
    if (keyed.length >= 3 && !STATUS_NAME.test(toks[k - 2]?.v ?? ''))
      groups.push({
        name: `map@${toks[k - 2]?.v ?? ''}`,
        items: keyed.map(p =>
          strTokens(p.slice(2))
            .map(s => s.v)
            .join(' ')
        ),
      });
  }
  for (const g of groups) {
    const fills = g.items
      .map(s => bgAccents(s))
      .filter(list => list.length === 1)
      .map(l => l[0]);
    if (fills.length < 3 || fills.length < g.items.length * 0.6) continue;
    const accents = new Set(fills.map(f => f.family));
    if (accents.size < 2) continue;
    const sig = new Set(
      fills.map(
        p => `${p.step || '-'}/${p.opacity || '-'}/${p.soft ? 'soft' : 'hard'}`
      )
    );
    if (sig.size > 1)
      ids.add(`unequal-weight:${file}:${g.name}:${[...sig].sort().join('|')}`);
  }
  return [...ids];
}

/* ------------------------------------------------------------------- CSS */

function cssRules(text) {
  const rules = [];
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g))
    rules.push({ selector: m[1].trim().replace(/\s+/g, ' '), body: m[2] });
  return rules;
}

const CSS_SMALL =
  /dot|badge|pill|chip|swatch|bar|indicator|marker|track|fill|thumb|ring|glow|line|status|avatar|icon|tint|wash|halo|stroke|border|underline|edge/i;

export function cssIds(text, file, { tokenSource }) {
  const ids = new Set();
  if (!tokenSource) {
    for (const id of offPackVarIds(text, file)) ids.add(id);
    for (const id of offPackTailwindIds(text, file)) ids.add(id);
  }
  for (const id of gradientIds([text], file)) ids.add(id);
  for (const rule of cssRules(text)) {
    const bg = [
      ...rule.body.matchAll(
        /(?:^|;|\s)background(?:-color|-image)?\s*:\s*([^;]+)/g
      ),
    ].map(m => m[1].trim());
    const flat = bg.filter(v => !/gradient\(/.test(v));
    const fams = new Set();
    for (const v of flat)
      for (const f of colorFamilies(v))
        if (f !== 'red' && f !== 'green') fams.add(f);
    if (fams.size >= 2)
      ids.add(
        `multi-accent-item:${file}:${rule.selector.slice(0, 60)}:${[...fams].map(accentOf).sort().join('+')}`
      );
    if (
      CSS_SMALL.test(rule.selector) ||
      /^@|^from|^to|^\d+%/.test(rule.selector)
    )
      continue;
    for (const v of flat) {
      // solid: pack hex or a non-soft accent var; soft means subtle/soft names or alpha <= .12
      const solid = [
        ...v.matchAll(
          /#[0-9a-fA-F]{6}\b|var\(--(?:color-accent|noir-ion)-[a-z]+\)/g
        ),
      ].filter(m => colorFamilies(m[0]).length && !/subtle|soft/.test(m[0]));
      if (
        solid.length &&
        !/\balpha\b|\/\s*0?\.?(?:0\d?|1[0-2]?)\)|,\s*0?\.(?:0\d?|1[0-2]?)\)/.test(
          v
        ) &&
        !/color-mix/.test(v)
      ) {
        ids.add(`solid-accent-fill:${file}:${rule.selector.slice(0, 60)}`);
        break;
      }
    }
  }
  return [...ids];
}

/* ----------------------------------------------------------- file scanner */

export function scanSource(source, file, options) {
  const { allowedHex, tokenSource = false } = options;
  const ext = file.slice(file.lastIndexOf('.'));
  if (ext === '.css') {
    const text = source.replace(/\/\*[\s\S]*?\*\//g, '');
    return cssIds(text, file, { tokenSource });
  }
  const toks = tokenize(source);
  const strings = strTokens(toks).map(t => t.v);
  const joined = strings.join('\n');
  /** @type {string[]} */
  const ids = [];
  if (!tokenSource) {
    ids.push(
      ...offPackTailwindIds(joined, file),
      ...offPackVarIds(joined, file)
    );
    if (ext === '.tsx' || ext === '.jsx')
      ids.push(...offPackLiteralIds(toks, file, allowedHex));
  }
  ids.push(...gradientIds(strings, file));
  ids.push(...rotationIds(toks, source, file));
  ids.push(...weightIds(toks, file));
  if (ext === '.tsx' || ext === '.jsx')
    ids.push(...jsxIds(toks, file, { dataViz: DATA_VIZ_PATH.test(file) }));
  return [...new Set(ids)];
}
