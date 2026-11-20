// A structural reader for the generated-action contract, not a YAML parser.
// Only explicit block mappings/sequences and single-line literal fields can
// prove that contract. Aliases, merges, flow mappings and duplicate keys fail
// closed when traversed. Unrelated values are opaque; script bodies are never
// interpreted as metadata. This must run before node_modules exists.
export function contractLines(source) {
  const rows = [];
  let scalarIndent = -1;
  for (const [line, raw] of source.split(/\r?\n/).entries()) {
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    const indent = raw.length - raw.trimStart().length;
    if (scalarIndent >= 0 && indent > scalarIndent) continue;
    scalarIndent = -1;
    if (/^\s*\t/.test(raw)) throw new Error('Unsupported tab indentation');
    const text = raw.trim();
    // Only complete step anchors are supported; anchors in opaque values could
    // shadow an earlier step and change the meaning of a later alias.
    if (
      /(?:^|[\s,[{])&[A-Za-z0-9_-]+/.test(text) &&
      !/^- &[A-Za-z0-9_-]+$/.test(text)
    ) {
      throw new Error('Unsupported nested anchor');
    }
    rows.push({ indent, text, line });
    if (/:\s*[|>][-+0-9]*\s*(?:#.*)?$/.test(text)) {
      scalarIndent = indent + (text.startsWith('- ') ? 2 : 0);
    }
  }
  return rows;
}

export function contractMap(rows) {
  const entries = new Map();
  if (!rows.length) return entries;
  const indent = rows[0].indent;
  for (let index = 0; index < rows.length; ) {
    const row = rows[index];
    const match = /^([A-Za-z_][A-Za-z0-9_.-]*):(?:\s+(.*)|$)/.exec(row.text);
    if (row.indent !== indent || !match || entries.has(match[1])) {
      throw new Error('Unsupported or duplicate contract mapping key');
    }
    let end = index + 1;
    while (end < rows.length && rows[end].indent > indent) end++;
    const rawValue = (match[2] ?? '').trim();
    entries.set(match[1], {
      value: /^["']/.test(rawValue)
        ? rawValue
        : rawValue.replace(/(?:^|\s+)#.*$/, '').trim(),
      children: rows.slice(index + 1, end),
      line: row.line,
    });
    index = end;
  }
  return entries;
}

export function contractChildren(entry) {
  if (!entry || entry.value) throw new Error('Expected explicit block mapping');
  return contractMap(entry.children);
}

export function contractScalar(entry) {
  if (!entry || entry.children.length)
    throw new Error('Expected literal field');
  const value = entry.value;
  const single = /^('(?:[^']|'')*')(?:\s+#.*)?$/.exec(value);
  if (single) return single[1].slice(1, -1).replaceAll("''", "'");
  const double = /^("(?:[^"\\]|\\.)*")(?:\s+#.*)?$/.exec(value);
  if (double) return JSON.parse(double[1]);
  // YAML booleans, nulls, numbers and timestamps are not literal path/ID
  // strings. Numeric-leading names must be quoted in this bounded contract.
  if (
    !value ||
    /^["'!&*[{|>@`]/.test(value) ||
    /:\s/.test(value) ||
    /^(?:null$|true$|false$|~$|[-+]?(?:[0-9]|\.[0-9]|\.inf$|\.nan$))/i.test(
      value
    )
  ) {
    throw new Error('Unsupported contract scalar');
  }
  return value;
}

export function contractSteps(entry, anchors = new Map()) {
  if (entry?.value === '[]' && !entry.children.length) return [];
  if (!entry || entry.value) throw new Error('Expected explicit steps');
  const rows = entry.children;
  const steps = [];
  const indent = rows[0]?.indent;
  for (let index = 0; index < rows.length; ) {
    const row = rows[index];
    if (row.indent !== indent || !row.text.startsWith('- ')) {
      throw new Error('Unsupported contract sequence');
    }
    let end = index + 1;
    while (end < rows.length && rows[end].indent > indent) end++;
    const text = row.text.slice(2);
    const anchor = /^[&*][A-Za-z0-9_-]+$/.test(text);
    const children = rows.slice(index + 1, end);
    let fields;
    if (text.startsWith('*') && anchor) {
      if (children.length || !anchors.has(text.slice(1)))
        throw new Error('Unknown step alias');
      fields = anchors.get(text.slice(1));
    } else {
      fields = contractMap(
        anchor ? children : [{ ...row, indent: indent + 2, text }, ...children]
      );
      if (anchor) {
        if (anchors.has(text.slice(1)))
          throw new Error('Duplicate step anchor');
        anchors.set(text.slice(1), fields);
      }
    }
    steps.push({ fields, anchor });
    index = end;
  }
  return steps;
}
