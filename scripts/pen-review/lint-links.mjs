import { MAX_DEPTH, object, safeId } from './lint-format.mjs';

function namespace(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  const pieces = raw.split(':');
  if (
    (pieces.length !== 1 && pieces.length !== 2) ||
    pieces.some(x => !safeId(x))
  )
    return null;
  return pieces.length === 1
    ? { id: raw }
    : { alias: pieces[0], id: pieces[1] };
}

export function lookup(model, raw, map) {
  const parts = namespace(raw);
  if (!parts) return { state: 'invalid' };
  const { alias, id } = parts;
  if (!alias) {
    const result = model[map].get(id);
    return result
      ? { state: 'found', model, result, id }
      : { state: 'missing' };
  }
  if (!model.imports.has(alias)) return { state: 'undeclared' };
  const external = model.linked.get(alias);
  if (!external) return { state: 'unverified', alias };
  const result = external[map].get(id);
  return result
    ? { state: 'found', model: external, result, id, alias }
    : { state: 'missing' };
}

function axesOf(entry) {
  const axes = entry.node.reusable;
  if (!object(axes) || !Object.keys(axes).length) return null;
  for (const allowed of Object.values(axes)) {
    if (
      !Array.isArray(allowed) ||
      !allowed.length ||
      allowed.some(value => typeof value !== 'string' || !value) ||
      new Set(allowed).size !== allowed.length
    )
      return null;
  }
  return axes;
}

function selectorValid(check, axes) {
  return (
    object(check) &&
    Object.entries(check).every(
      ([axis, value]) =>
        typeof value === 'string' &&
        Object.hasOwn(axes, axis) &&
        axes[axis].includes(value)
    )
  );
}

export function resolveRef(model, raw, variant) {
  const origin = lookup(model, raw, 'index');
  if (origin.state !== 'found') return origin;
  const entry = origin.result;
  if (entry.node.type !== 'variants') {
    const reusable =
      entry.node.reusable === true ||
      (entry.parent?.node.type === 'variants' &&
        object(entry.node.reusable) &&
        selectorValid(entry.node.reusable, axesOf(entry.parent) ?? {}));
    if (!reusable) return { state: 'not-origin' };
    if (
      variant !== undefined &&
      (!object(variant) || Object.keys(variant).length)
    )
      return { state: 'bad-variant' };
    return { ...origin, selected: entry, selection: {} };
  }
  const axes = axesOf(entry);
  if (!axes || (variant !== undefined && !selectorValid(variant, axes)))
    return { state: 'bad-variant' };
  const selection = Object.fromEntries(
    Object.entries(axes).map(([axis, allowed]) => [
      axis,
      variant?.[axis] ?? allowed[0],
    ])
  );
  const selectedNode = (
    Array.isArray(entry.node.children) ? entry.node.children : []
  ).find(
    child =>
      object(child?.reusable) &&
      selectorValid(child.reusable, axes) &&
      Object.entries(child.reusable).every(
        ([axis, val]) => selection[axis] === val
      )
  );
  if (!selectedNode) return { state: 'bad-variant' };
  return {
    ...origin,
    selection,
    selected: origin.model.index.get(selectedNode.id),
  };
}

function attachedTo(entry, ancestor) {
  for (let e = entry?.parent; e; e = e.parent) if (e === ancestor) return true;
  return false;
}

export const inside = (entry, parent) =>
  entry === parent || attachedTo(entry, parent);

function overrideState(origin, path) {
  let current = origin;
  const steps = path.split('/');
  for (const [index, part] of steps.entries()) {
    const chunks = namespace(part);
    if (!chunks || (chunks.alias && chunks.alias !== current.alias))
      return 'missing';
    const target = current.model.index.get(chunks.id);
    if (!target || !attachedTo(target, current.selected)) return 'missing';
    if (index === steps.length - 1) return 'found';
    if (target.node.type !== 'ref') return 'missing';
    const child = resolveRef(
      current.model,
      target.node.ref,
      target.node.variant
    );
    if (child.state !== 'found')
      return child.state === 'unverified' ? 'unverified' : 'missing';
    current = { ...child, alias: child.alias ?? current.alias };
  }
  return 'missing';
}

function linkFinding(model, e, raw, result, kind) {
  if (result.state === 'found') return;
  const { state, alias } = result;
  const suggestion =
    state === 'unverified'
      ? `Supply the approved frozen library with --library ${alias}=PATH, or open it in Pen to verify.`
      : state === 'bad-variant'
        ? 'Select a declared native variant rather than substituting or detaching layers.'
        : state === 'not-origin'
          ? 'Point to a declared reusable origin, not a lookalike layer.'
          : 'Relink by ID to a local origin or to a declared library alias.';
  model.report(
    state === 'unverified' ? 'unverified' : 'error',
    `${kind}.${state}`,
    e.where,
    raw,
    suggestion
  );
}

// Scan only native bindable properties. Notes, metadata, and arbitrary literals
// such as "$12" are not references just because they contain a dollar sign.
const bindable = new Set([
  'enabled',
  'opacity',
  'rotation',
  'width',
  'height',
  'fill',
  'stroke',
  'color',
  'strokeWidth',
  'cornerRadius',
  'clip',
  'innerRadius',
  'startAngle',
  'sweepAngle',
  'polygonCount',
  'gap',
  'padding',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'letterSpacing',
  'fontStyle',
  'underline',
  'lineHeight',
  'textAlign',
  'textAlignVertical',
  'strikethrough',
  'href',
  'content',
  'size',
  'position',
  'radius',
  'blur',
  'offset',
  'uniforms',
  'value',
  'icon',
  'library',
  'weight',
]);
const maybeVariable = (model, value) =>
  typeof value === 'string' &&
  value.startsWith('$') &&
  (model.variables.has(value.slice(1)) || /^\$[\p{L}_][^\r\n]*$/u.test(value));

export function variableChain(model, value, seen = new Set()) {
  if (!maybeVariable(model, value)) return { state: 'literal', values: [] };
  const key = value.slice(1);
  const resolved = lookup(model, key, 'variables');
  if (resolved.state !== 'found')
    return { state: resolved.state, values: [value], alias: resolved.alias };
  const stable = resolved.result;
  if (seen.has(stable) || seen.size >= MAX_DEPTH)
    return { state: 'cycle', values: [value] };
  const next = new Set(seen).add(stable);
  const { value: actual } = stable;
  const values = Array.isArray(actual)
    ? actual.map(item => item?.value)
    : [actual];
  if (!values.length || values.some(x => x === undefined))
    return { state: 'invalid', values: [value] };
  const chains = values.map(x => variableChain(resolved.model, x, next));
  const invalid = chains.find(
    x => x.state !== 'literal' && x.state !== 'found'
  );
  return invalid
    ? { ...invalid, values: [value, ...invalid.values] }
    : {
        state: 'found',
        values: [
          value,
          ...[...new Set(chains.flatMap(x => x.values))].filter(x =>
            chains.every(c => c.values.includes(x))
          ),
        ],
      };
}

function scanBindings(model, properties, where) {
  function check(value, path, depth) {
    if (depth > MAX_DEPTH) return;
    if (maybeVariable(model, value)) {
      const chain = variableChain(model, value);
      if (chain.state !== 'found')
        linkFinding(
          model,
          { where: { ...where, path } },
          value,
          chain,
          'variable'
        );
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => check(item, `${path}[${i}]`, depth + 1));
    } else if (object(value)) {
      for (const [key, item] of Object.entries(value))
        check(item, `${path}.${key}`, depth + 1);
    }
  }
  for (const [key, value] of Object.entries(properties)) {
    if (bindable.has(key)) check(value, `${where.path}.${key}`, 0);
  }
}

export function checkLinks(model) {
  for (const [name, value] of model.variables)
    scanBindings(
      model,
      { value: value.value },
      { ...model.base, path: `$.variables.${name}` }
    );
  // Nonempty Page nodes may contain any supported drawable; they are not frames.
  // This guards first-pass blank data, not viewport placement or rendered pixels.
  if (
    !model.entries.some(e => e.node.type !== 'page' && e.node.enabled !== false)
  )
    model.report(
      'warning',
      'canvas.empty',
      model.base,
      model.version,
      'Check that the intended canvas has layers, then reopen in Pen. Layer presence cannot prove rendered visibility.'
    );
  for (const e of model.entries) {
    const { node, where } = e;
    if (node.type === 'variants') {
      const axes = axesOf(e);
      if (
        !axes ||
        !Array.isArray(node.children) ||
        !node.children.some(
          child =>
            object(child?.reusable) && selectorValid(child.reusable, axes)
        )
      )
        model.report(
          'error',
          'variant.definition',
          where,
          node.reusable ?? null,
          'Declare nonempty axes and at least one native reusable variant child.'
        );
      if (axes && Array.isArray(node.children))
        for (const child of node.children) {
          if (object(child?.reusable) && !selectorValid(child.reusable, axes))
            model.report(
              'error',
              'variant.definition',
              model.index.get(child.id)?.where ?? where,
              child.reusable,
              'Use the parent variant set’s declared axis values.'
            );
        }
    }
    if (node.type === 'ref') {
      const origin = resolveRef(model, node.ref, node.variant);
      linkFinding(
        model,
        e,
        { ref: node.ref, variant: node.variant },
        origin,
        'instance'
      );
      if (object(node.descendants))
        for (const [path, change] of Object.entries(node.descendants)) {
          if (!object(change)) continue;
          if (origin.state === 'found')
            linkFinding(
              model,
              e,
              path,
              { state: overrideState(origin, path), alias: origin.alias },
              'override'
            );
          if (!Object.hasOwn(change, 'type'))
            scanBindings(model, change, {
              ...where,
              path: `${where.path}.descendants[${JSON.stringify(path)}]`,
            });
        }
    }
    if (node.slot !== undefined && node.slot !== false) {
      if (node.type !== 'frame' || !Array.isArray(node.slot)) {
        model.report(
          'error',
          'slot.definition',
          where,
          node.slot,
          'A native frame slot is false or a list of suggested component IDs.'
        );
      } else
        for (const raw of node.slot)
          linkFinding(model, e, raw, resolveRef(model, raw), 'slot');
    }
    if (node.type !== 'note') scanBindings(model, node, where);
  }
}
