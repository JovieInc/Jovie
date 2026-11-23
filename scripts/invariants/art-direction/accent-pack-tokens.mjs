/** Accent pack source tokenizer and JSX/array structure readers. Pure: source text in, violation ids out. */

const KEYWORD_BEFORE_JSX = new Set([
  'return',
  'case',
  'default',
  'else',
  'yield',
  'await',
  'in',
  'of',
]);

export function tokenize(source) {
  const toks = [];
  const n = source.length;
  let i = 0;
  while (i < n) {
    const c = source[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && source[j] !== c && source[j] !== '\n')
        j += source[j] === '\\' ? 2 : 1;
      if (source[j] === c) {
        toks.push({ t: 'str', v: source.slice(i + 1, j), i });
        i = j + 1;
      } else {
        toks.push({ t: 'p', v: c, i });
        i++;
      }
      continue;
    }
    if (c === '`') {
      let j = i + 1;
      let depth = 0;
      while (j < n) {
        const d = source[j];
        if (d === '\\') {
          j += 2;
          continue;
        }
        if (depth === 0 && d === '`') break;
        if (d === '$' && source[j + 1] === '{') {
          depth++;
          j += 2;
          continue;
        }
        if (depth > 0 && d === '{') depth++;
        if (depth > 0 && d === '}') depth--;
        j++;
      }
      toks.push({ t: 'str', v: source.slice(i + 1, j), i, tpl: true });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const m = /^[A-Za-z_$][\w$]*(?:-[A-Za-z][\w$]*)*/.exec(
        source.slice(i, i + 80)
      );
      toks.push({ t: 'id', v: m[0], i });
      i += m[0].length;
      continue;
    }
    if (/\d/.test(c)) {
      const m = /^[\d.]+/.exec(source.slice(i, i + 30));
      toks.push({ t: 'num', v: m[0], i });
      i += m[0].length;
      continue;
    }
    if (c === '=' && source[i + 1] === '>') {
      toks.push({ t: 'p', v: '=>', i });
      i += 2;
      continue;
    }
    toks.push({ t: 'p', v: c, i });
    i++;
  }
  return toks;
}

const OPEN = { '(': ')', '[': ']', '{': '}' };

export function matchClose(toks, start) {
  const open = toks[start].v;
  const close = OPEN[open];
  let depth = 0;
  for (let k = start; k < toks.length; k++) {
    const tk = toks[k];
    if (tk.t !== 'p') continue;
    if (tk.v === open) depth++;
    else if (tk.v === close && --depth === 0) return k;
  }
  return -1;
}

/** JSX opening tags: { tag, toks } with all tokens up to the closing `>`. */
export function jsxElements(toks) {
  const out = [];
  for (let k = 0; k < toks.length - 1; k++) {
    if (toks[k].t !== 'p' || toks[k].v !== '<' || toks[k + 1].t !== 'id')
      continue;
    const prev = toks[k - 1];
    if (
      prev &&
      ((prev.t === 'id' && !KEYWORD_BEFORE_JSX.has(prev.v)) ||
        prev.t === 'num' ||
        prev.t === 'str' ||
        (prev.t === 'p' && (prev.v === ')' || prev.v === ']')))
    )
      continue;
    let depth = 0;
    let end = -1;
    for (let m = k + 2; m < toks.length && m < k + 600; m++) {
      const tk = toks[m];
      if (tk.t !== 'p') continue;
      if (tk.v === '{' || tk.v === '(' || tk.v === '[') depth++;
      else if (tk.v === '}' || tk.v === ')' || tk.v === ']') depth--;
      else if (tk.v === '>' && depth === 0) {
        end = m;
        break;
      } else if (tk.v === '<' && depth === 0) break;
    }
    if (end === -1) continue;
    out.push({ tag: toks[k + 1].v, toks: toks.slice(k + 2, end) });
  }
  return out;
}

/** Array literals: { name, toks (inside), elements: token[][] }. */
export function arrayLiterals(toks) {
  const out = [];
  for (let k = 0; k < toks.length; k++) {
    const tk = toks[k];
    if (tk.t !== 'p' || tk.v !== '[') continue;
    const prev = toks[k - 1];
    if (
      prev &&
      ((prev.t === 'id' && !KEYWORD_BEFORE_JSX.has(prev.v)) ||
        prev.t === 'num' ||
        prev.t === 'str' ||
        (prev.t === 'p' && (prev.v === ')' || prev.v === ']')))
    )
      continue;
    const end = matchClose(toks, k);
    if (end === -1) continue;
    const inner = toks.slice(k + 1, end);
    const elements = [];
    let cur = [];
    let depth = 0;
    for (const it of inner) {
      if (it.t === 'p' && '([{'.includes(it.v)) depth++;
      if (it.t === 'p' && ')]}'.includes(it.v)) depth--;
      if (it.t === 'p' && it.v === ',' && depth === 0) {
        elements.push(cur);
        cur = [];
        continue;
      }
      cur.push(it);
    }
    if (cur.length) elements.push(cur);
    // Declared name: walk back to `=` then collect identifiers to the keyword.
    let name = '';
    let b = k - 1;
    if (toks[b] && toks[b].v === '(') b--; // `= Object.freeze([`
    while (
      b >= 0 &&
      toks[b].t === 'p' &&
      (toks[b].v === '.' || toks[b].v === '(')
    )
      b -= 2;
    if (toks[b] && toks[b].v === '=') {
      const names = [];
      for (let c = b - 1; c >= 0 && c > b - 12; c--) {
        if (
          toks[c].t === 'id' &&
          /^(const|let|var|export|type|function)$/.test(toks[c].v)
        )
          break;
        if (toks[c].t === 'id') names.unshift(toks[c].v);
        if (toks[c].t === 'p' && (toks[c].v === ';' || toks[c].v === '}'))
          break;
      }
      name = names.join(' ');
    } else if (
      toks[b] &&
      toks[b].t === 'p' &&
      toks[b].v === ':' &&
      toks[b - 1]?.t === 'id'
    ) {
      name = toks[b - 1].v;
    }
    out.push({ name, elements, start: k, end });
  }
  return out;
}

/* --------------------------------------------------------- name -> accent */
