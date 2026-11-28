import { object } from './lint-format.mjs';
import { inside, resolveRef, variableChain } from './lint-links.mjs';

const lifecycle = new Set(['canonical', 'archive', 'alternate']);
const string = val => typeof val === 'string' && val.length > 0;
const selector = val => object(val) && Object.values(val).every(string);
const optionalList = (list, check) =>
  list === undefined || (Array.isArray(list) && list.every(check));
const pathIsValid = val =>
  Array.isArray(val) && val.length > 0 && val.every(string);
const instanceRule = rule =>
  object(rule) &&
  string(rule.ref) &&
  (rule.node === undefined || string(rule.node)) &&
  (rule.within === undefined || string(rule.within)) &&
  (rule.variant === undefined || selector(rule.variant));
const placement = loc =>
  object(loc) &&
  string(loc.parent) &&
  Array.isArray(loc.children) &&
  loc.children.length === 3 &&
  loc.children.every(string) &&
  new Set(loc.children).size === 3;
const orderingRule = r =>
  object(r) &&
  Array.isArray(r.placements) &&
  r.placements.length > 0 &&
  r.placements.every(placement);
const bindingRule = r =>
  object(r) &&
  string(r.node) &&
  pathIsValid(r.property) &&
  string(r.variable) &&
  r.variable.startsWith('$') &&
  optionalList(
    r.allowLiterals,
    value =>
      value === null || ['string', 'number', 'boolean'].includes(typeof value)
  );

export function validPolicy(policy) {
  return (
    object(policy) &&
    policy.version === 1 &&
    (policy.penVersion === undefined || string(policy.penVersion)) &&
    Array.isArray(policy.surfaces) &&
    new Set(policy.surfaces.map(surface => surface?.key)).size ===
      policy.surfaces.length &&
    policy.surfaces.every(
      surface =>
        object(surface) &&
        string(surface.key) &&
        optionalList(
          surface.candidates,
          c => object(c) && string(c.id) && lifecycle.has(c.state)
        ) &&
        optionalList(surface.instances, instanceRule) &&
        optionalList(surface.entityShareTabs, orderingRule) &&
        optionalList(surface.bindings, bindingRule)
    )
  );
}

function candidatesFor(model, surface) {
  const explicit = new Map();
  for (const { id, state } of surface.candidates ?? []) {
    if (explicit.has(id))
      model.report(
        'error',
        'policy.candidate-duplicate',
        model.index.get(id)?.where ?? model.base,
        { surface: surface.key, id },
        'Use one lifecycle declaration per design frame.'
      );
    else explicit.set(id, state);
  }
  for (const { node, where } of model.entries) {
    const meta = node.metadata;
    if (
      !object(meta) ||
      meta.type !== 'jovie.design/v1' ||
      meta.surface !== surface.key
    )
      continue;
    if (
      !lifecycle.has(meta.state) ||
      (explicit.has(node.id) && explicit.get(node.id) !== meta.state)
    ) {
      model.report(
        'error',
        'policy.lifecycle',
        where,
        meta.state,
        'Agree on one explicit lifecycle state; never infer it from a frame name.'
      );
      continue;
    }
    explicit.set(node.id, meta.state);
  }
  const active = [];
  for (const [id, state] of explicit) {
    const f = model.index.get(id);
    if (!f || f.node.type !== 'frame') {
      model.report(
        'error',
        'policy.candidate-missing',
        f?.where ?? model.base,
        { surface: surface.key, id, state },
        'Point to the durable ID of an extant design frame.'
      );
    } else if (state === 'canonical') active.push(f);
  }
  if (active.length !== 1) {
    model.report(
      'error',
      'policy.canonical-count',
      active[1]?.where ?? active[0]?.where ?? model.base,
      { surface: surface.key, canonical: active.map(x => x.node.id) },
      'Declare exactly one canonical frame, and preserve archived or intentional alternate frames with explicit lifecycle states.'
    );
  }
  return active.length === 1 ? active[0] : null;
}

function requireInstance(model, frame, rule) {
  const scope =
    rule.within === undefined ? frame : model.index.get(rule.within);
  const target = rule.node === undefined ? null : model.index.get(rule.node);
  if (
    !scope ||
    !inside(scope, frame) ||
    (rule.node !== undefined && (!target || !inside(target, scope)))
  ) {
    model.report(
      'error',
      'policy.instance-placement',
      target?.where ?? frame.where,
      rule,
      'Use an existing position within this canonical frame. Choose a different explicit slot for a genuinely alternate placement.'
    );
    return;
  }
  const matches = (
    target ? [target] : model.entries.filter(entry => inside(entry, scope))
  ).filter(e => e.node.type === 'ref' && e.node.ref === rule.ref);
  if (!matches.length) {
    model.report(
      'error',
      'policy.instance-missing',
      target?.where ?? scope.where,
      rule,
      'Instance the required native origin. A detached layer or similarly named component does not satisfy this rule.'
    );
    return;
  }
  let unresolved;
  for (const entry of matches) {
    const state = resolveRef(model, entry.node.ref, entry.node.variant);
    if (
      state.state === 'found' &&
      Object.entries(rule.variant ?? {}).every(
        ([k, v]) => state.selection[k] === v
      )
    )
      return;
    if (state.state === 'unverified') unresolved = entry;
  }
  if (unresolved) {
    model.report(
      'unverified',
      'policy.instance-unverified',
      unresolved.where,
      rule,
      'Supply the approved imported Pen library to verify the origin and selected variant.'
    );
  } else {
    model.report(
      'error',
      'policy.instance-variant',
      matches[0].where,
      { expected: rule.variant ?? {}, observed: matches[0].node.variant ?? {} },
      'Use the required native variant on the same component origin.'
    );
  }
}

function requireOrder(model, frame, rule) {
  let incomparable;
  let invalid;
  for (const loc of rule.placements) {
    const parent = model.index.get(loc.parent);
    if (!parent || !inside(parent, frame)) continue;
    const children = Array.isArray(parent.node.children)
      ? parent.node.children
      : [];
    const positions = loc.children.map(id =>
      children.findIndex(n => n?.id === id)
    );
    if (positions.some(i => i < 0)) continue;
    if (
      parent.node.layout !== 'vertical' ||
      positions.some(i => children[i]?.layoutPosition === 'absolute')
    ) {
      incomparable = { parent, loc };
    } else if (positions[0] < positions[1] && positions[1] < positions[2])
      return;
    else invalid = { parent, loc, positions };
  }
  if (incomparable) {
    model.report(
      'unverified',
      'policy.rail-order-unverified',
      incomparable.parent.where,
      incomparable.loc,
      'Read the intended order in native Pen: absolute or nonvertical placement does not establish visual order from serialized child order.'
    );
  } else {
    model.report(
      'error',
      'policy.rail-order',
      invalid?.parent.where ?? frame.where,
      invalid?.positions ?? rule.placements,
      'Put the approved Entity, Share and Tabs IDs in order in a declared vertical stack, or explicitly list a valid alternate stack.'
    );
  }
}

function readProperty(node, path) {
  let value = node;
  for (const key of path) {
    if ((object(value) || Array.isArray(value)) && Object.hasOwn(value, key))
      value = value[key];
    else return undefined;
  }
  return value;
}

function requireBinding(model, frame, rule) {
  const entry = model.index.get(rule.node);
  if (!entry || !inside(entry, frame)) {
    model.report(
      'error',
      'policy.binding-target',
      frame.where,
      rule,
      'Bind a property of an identified native node inside this canonical frame.'
    );
    return;
  }
  const where = {
    ...entry.where,
    path: `${entry.where.path}.${rule.property.join('.')}`,
  };
  let bindingModel = model;
  let actual = readProperty(entry.node, rule.property);
  if (actual === undefined && entry.node.type === 'ref') {
    const origin = resolveRef(model, entry.node.ref, entry.node.variant);
    if (origin.state === 'unverified') {
      model.report(
        'unverified',
        'policy.binding-unverified',
        where,
        rule.variable,
        'Supply the approved library to verify the inherited variable.'
      );
      return;
    }
    if (origin.state === 'found') {
      bindingModel = origin.model;
      actual = readProperty(origin.selected.node, rule.property);
      // Native internal library variables are unqualified within the origin.
      if (
        typeof actual === 'string' &&
        origin.alias &&
        /^\$[^:]+$/u.test(actual) &&
        rule.variable === `$${origin.alias}:${actual.slice(1)}`
      )
        return;
    }
  }
  const chain = variableChain(bindingModel, actual);
  if (chain.state === 'unverified') {
    model.report(
      'unverified',
      'policy.binding-unverified',
      where,
      actual,
      'Supply the approved library to verify the scoped binding.'
    );
  } else if (
    !(
      (chain.state === 'found' && chain.values.includes(rule.variable)) ||
      (chain.state === 'literal' &&
        rule.allowLiterals?.some(value => Object.is(value, actual)))
    )
  ) {
    model.report(
      'error',
      'policy.binding',
      where,
      { expected: rule.variable, actual: actual ?? null },
      'Use the approved shared variable (or its resolvable alias), or document a narrowly approved literal exception for this exact property.'
    );
  }
}

export function checkPolicy(model, policy) {
  if (policy.penVersion && model.version !== policy.penVersion) {
    model.report(
      'error',
      'policy.pen-version',
      model.base,
      { actual: model.version, expected: policy.penVersion },
      'Read an approved snapshot for the policy’s Pen version. Do not rewrite the file header.'
    );
    return;
  }
  for (const surface of policy.surfaces) {
    const frame = candidatesFor(model, surface);
    if (!frame) continue;
    for (const rule of surface.instances ?? [])
      requireInstance(model, frame, rule);
    for (const rule of surface.entityShareTabs ?? [])
      requireOrder(model, frame, rule);
    for (const rule of surface.bindings ?? [])
      requireBinding(model, frame, rule);
  }
}
