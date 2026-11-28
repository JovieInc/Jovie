// The two root encodings come from the Pen vendor's native tutorial sample
// (2.17) and published schema (2.26). Never reinterpret an unknown version.
export const PEN_VERSIONS = new Set(['2.17', '2.26']);
export const MAX_NODES = 100_000;
export const MAX_DEPTH = 96;
const shapeTypes = new Set([
  'frame',
  'group',
  'rectangle',
  'ellipse',
  'path',
  'polygon',
  'text',
  'note',
  'icon',
  'script',
  'browser',
  'ref',
]);
const containers = new Set(['page', 'frame', 'group', 'variants', 'script']);
export const object = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
export const safeId = value =>
  typeof value === 'string' && value.length > 0 && !/[:/]/u.test(value);
const variableTypes = new Set(['color', 'number', 'boolean', 'string']);

export function parsePen(text) {
  // Preserve positions in errors; never treat // or /* inside a string as comments.
  let quote = false;
  let result = '';
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === '"') quote = false;
    } else if (c === '"') {
      quote = true;
    } else if (c === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) {
      const line = text[i + 1] === '/';
      const begin = i;
      i += 2;
      if (line) {
        while (i < text.length && !/[\r\n]/u.test(text[i])) i++;
      } else {
        const end = text.indexOf('*/', i);
        if (end < 0) throw new SyntaxError('Unterminated block comment');
        i = end + 2;
      }
      result +=
        text.slice(start, begin) +
        text.slice(begin, i).replace(/[^\r\n]/gu, ' ');
      start = i;
      i--;
    }
  }
  return JSON.parse(result + text.slice(start));
}

const tag = node =>
  typeof node.name === 'string'
    ? { id: node.id, name: node.name }
    : { id: node.id };

function mapField(document, name, report, base) {
  const raw = document[name];
  if (raw === undefined) return {};
  if (object(raw)) return raw;
  report(
    'error',
    'format.map',
    base,
    name,
    'Supply an object keyed by its declared names.'
  );
  return {};
}

export function inspectDocument(document, file, report) {
  const base = { file, path: '$' };
  if (!object(document) || !PEN_VERSIONS.has(document.version)) {
    report(
      'error',
      'format.version',
      base,
      document?.version ?? null,
      'Use a supported Pen schema (2.17 legacy or 2.26 paged); do not edit the version string to migrate.'
    );
    return null;
  }
  const { version } = document;
  const imports = new Map();
  const variables = new Map();
  const index = new Map();
  const entries = [];
  const linked = new Map();
  for (const [alias, target] of Object.entries(
    mapField(document, 'imports', report, base)
  )) {
    if (safeId(alias) && typeof target === 'string' && target.trim())
      imports.set(alias, target);
    else
      report(
        'error',
        'format.import',
        base,
        alias,
        'Declare a namespace and nonempty Pen library URI.'
      );
  }
  for (const [name, value] of Object.entries(
    mapField(document, 'variables', report, base)
  )) {
    if (
      name &&
      !name.includes(':') &&
      object(value) &&
      variableTypes.has(value.type) &&
      Object.hasOwn(value, 'value')
    ) {
      variables.set(name, value);
    } else {
      report(
        'error',
        'variable.definition',
        base,
        name,
        'Use a native type and a value or themed values.'
      );
    }
  }
  const model = {
    file,
    version,
    base,
    imports,
    variables,
    index,
    entries,
    linked,
    report,
  };
  const stack = [];
  const input = document.children;
  if (!Array.isArray(input) || (version === '2.26' && input.length === 0)) {
    report(
      'error',
      'format.root',
      base,
      version,
      version === '2.26'
        ? 'Supply a nonempty root array of native Page nodes.'
        : 'Supply the legacy root array of drawable nodes.'
    );
    return model;
  }
  let exceeded = false;
  function enqueue(items, parent, path, depth, atRoot = false) {
    if (!Array.isArray(items)) {
      report(
        'error',
        'format.children',
        parent?.where ?? base,
        path,
        'Supply an array of native child nodes.'
      );
      return;
    }
    if (
      depth > MAX_DEPTH ||
      items.length + stack.length + entries.length > MAX_NODES
    ) {
      if (!exceeded)
        report(
          'error',
          'format.limit',
          parent?.where ?? base,
          path,
          'Lint a smaller approved snapshot.'
        );
      exceeded = true;
      return;
    }
    for (let i = items.length - 1; i >= 0; i--) {
      stack.push({
        node: items[i],
        parent,
        path: `${path}[${i}]`,
        depth,
        atRoot,
      });
    }
  }
  enqueue(input, null, '$.children', 0, true);
  while (stack.length) {
    const entry = stack.pop();
    const { node, parent, path, depth, atRoot } = entry;
    const pageExpected = atRoot && version === '2.26';
    entry.where = {
      file,
      path,
      page:
        object(node) && node.type === 'page' ? tag(node) : parent?.where.page,
      frame:
        object(node) &&
        node.type === 'frame' &&
        (!parent || parent.node.type === 'page')
          ? tag(node)
          : parent?.where.frame,
      node: object(node) ? tag(node) : undefined,
    };
    if (!object(node) || !safeId(node.id)) {
      report(
        'error',
        'node.id',
        entry.where,
        node?.id ?? null,
        'Use a nonempty, document-unique node ID without namespace or descendant separators.'
      );
      continue;
    }
    const validType = pageExpected
      ? node.type === 'page'
      : shapeTypes.has(node.type) ||
        (version === '2.26' && node.type === 'variants') ||
        (version === '2.17' &&
          ['icon_font', 'prompt', 'context'].includes(node.type));
    if (!validType) {
      report(
        'error',
        pageExpected || atRoot ? 'format.root' : 'node.type',
        entry.where,
        node.type ?? null,
        pageExpected
          ? 'Native 2.26 root children must be Pages, not direct artboards.'
          : 'Use a drawable node supported by this schema; a Page may not be nested or used in a flat legacy root.'
      );
      continue;
    }
    const prior = index.get(node.id);
    if (prior)
      report(
        'error',
        'node.duplicate-id',
        entry.where,
        { id: node.id, firstPath: prior.path },
        'Give separate nodes separate durable IDs; retain the intended component ID.'
      );
    else index.set(node.id, entry);
    entries.push(entry);
    if (node.children !== undefined) {
      if (!containers.has(node.type))
        report(
          'error',
          'format.children',
          entry.where,
          node.type,
          'Place child layers inside a native container or a descendant override.'
        );
      else enqueue(node.children, entry, `${path}.children`, depth + 1);
    }
    if (node.type === 'ref' && node.descendants !== undefined) {
      if (!object(node.descendants))
        report(
          'error',
          'instance.overrides',
          entry.where,
          null,
          'Use an object keyed by native descendant ID paths.'
        );
      else
        for (const [key, change] of Object.entries(
          node.descendants
        ).reverse()) {
          if (!object(change) || !key || key.split('/').some(part => !part)) {
            report(
              'error',
              'instance.override',
              entry.where,
              key,
              'Use a nonempty native descendant ID path and an override object.'
            );
            continue;
          }
          const overridePath = `${path}.descendants[${JSON.stringify(key)}]`;
          if (Object.hasOwn(change, 'type'))
            enqueue([change], entry, overridePath, depth + 1);
          else if (change.children !== undefined)
            enqueue(
              change.children,
              entry,
              `${overridePath}.children`,
              depth + 1
            );
        }
    }
  }
  return model;
}
