/**
 * Quoted spans that do not run. Template `${...}` and Python f-string
 * `{...}` stay executable, so a draw inside one still counts.
 * Comments are already gone; this only decides which quotes are data.
 *
 * boundary: the seeds rule owns control detection. This module only
 * separates a quoted fixture from an executable draw.
 */

/** @returns {Array<[number, number]>} half-open ranges of non-running quotes. */
export function quotedSpans(text, lang) {
  const py = lang === 'py';
  const spans = [];
  const n = text.length;
  let i = 0;
  const push = (start, end) => {
    if (end > start) spans.push([start, end]);
  };
  const prefixOf = index => {
    let j = index;
    while (j > 0 && /[rRuUbBfF]/u.test(text[j - 1])) j -= 1;
    if (j > 0 && /[A-Za-z0-9_]/u.test(text[j - 1])) return '';
    return text.slice(j, index);
  };
  const scan = stop => {
    let depth = 0;
    while (i < n) {
      const c = text[i];
      if (c === '"' || c === "'" || (!py && c === '`')) {
        if (!py && c === '`') consumeTemplate();
        else {
          const prefix = py ? prefixOf(i) : '';
          consumeQuote(/f/iu.test(prefix), /r/iu.test(prefix));
        }
        continue;
      }
      if (stop === '}' && c === '{') {
        depth += 1;
        i += 1;
        continue;
      }
      if (stop === '}' && c === '}' && depth === 0) {
        i += 1;
        return;
      }
      if (stop === '}' && c === '}') depth -= 1;
      i += 1;
    }
  };
  const consumeQuote = (fstring, raw) => {
    const quote = text[i];
    const triple = py && text.startsWith(quote.repeat(3), i);
    const close = triple ? quote.repeat(3) : quote;
    const start = i;
    i += close.length;
    let chunk = start;
    while (i < n) {
      if (!raw && text[i] === '\\') {
        i += 2;
        continue;
      }
      if (text.startsWith(close, i)) {
        i += close.length;
        push(chunk, i);
        return;
      }
      if (!triple && text[i] === '\n') {
        push(chunk, i);
        return;
      }
      if (fstring && text[i] === '{') {
        if (text[i + 1] === '{') {
          i += 2;
          continue;
        }
        push(chunk, i);
        i += 1;
        scan('}');
        chunk = i;
        continue;
      }
      i += 1;
    }
    push(chunk, i);
  };
  const consumeTemplate = () => {
    const start = i;
    i += 1;
    let chunk = start;
    while (i < n) {
      if (text[i] === '\\') {
        i += 2;
        continue;
      }
      if (text[i] === '`') {
        i += 1;
        push(chunk, i);
        return;
      }
      if (text.startsWith('${', i)) {
        push(chunk, i);
        i += 2;
        scan('}');
        chunk = i;
        continue;
      }
      i += 1;
    }
    push(chunk, i);
  };
  scan(null);
  return spans;
}

/** Draws whose match index sits outside a quoted span. */
export function countDraws(text, pattern, lang) {
  const spans = quotedSpans(text, lang);
  const re = new RegExp(
    pattern.source,
    pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
  );
  let n = 0;
  for (const match of text.matchAll(re)) {
    const at = match.index ?? 0;
    if (!spans.some(([start, end]) => at >= start && at < end)) n += 1;
  }
  return n;
}
