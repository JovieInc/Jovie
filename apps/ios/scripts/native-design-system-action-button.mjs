/**
 * Project web ActionButton KEEP geometry into JovieActionButtonMetrics.
 * Source of truth: packages/ui/atoms/button-contract.ts (Tim KEEP 28/44).
 * Color/motion projection stay in their sibling modules.
 */
export const ACTION_BUTTON_START = '  // BEGIN GENERATED NATIVE ACTION BUTTON';
export const ACTION_BUTTON_END = '  // END GENERATED NATIVE ACTION BUTTON';

/** Parse one exported numeric const from button-contract.ts. */
export function contractNumber(source, name) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name))
    throw new Error(`Invalid ActionButton contract export: ${name}`);
  const matches = [
    ...source.matchAll(
      new RegExp(`^export const ${name}\\s*=\\s*(\\d+)\\s*;`, 'gm')
    ),
  ];
  if (matches.length === 0)
    throw new Error(`Missing ActionButton contract export: ${name}`);
  if (matches.length > 1)
    throw new Error(`Duplicate ActionButton contract export: ${name}`);
  return Number(matches[0][1]);
}

export function projectedActionButton(bindings, contractSource) {
  if (!Array.isArray(bindings) || bindings.length === 0)
    throw new Error('Native ActionButton bindings required');
  const names = new Set();
  const lines = [];
  for (const binding of bindings) {
    if (
      !Array.isArray(binding) ||
      binding.length !== 2 ||
      typeof binding[1] !== 'string'
    )
      throw new Error(
        'Ambiguous native ActionButton mapping: expected [name, contract export]'
      );
    const [name, source] = binding;
    if (!/^[a-zA-Z]\w*$/.test(name) || names.has(name))
      throw new Error(`Duplicate/invalid native ActionButton mapping: ${name}`);
    names.add(name);
    const value = contractNumber(contractSource, source);
    lines.push(
      `  /// Source: ${source}`,
      `  static let ${name}: CGFloat = ${value}`
    );
  }
  return `${ACTION_BUTTON_START}\n${lines.join('\n')}\n${ACTION_BUTTON_END}`;
}

export function replaceActionButtonProjection(source, projection) {
  const starts = source.split(ACTION_BUTTON_START).length - 1;
  const ends = source.split(ACTION_BUTTON_END).length - 1;
  if (
    starts !== 1 ||
    ends !== 1 ||
    source.indexOf(ACTION_BUTTON_START) > source.indexOf(ACTION_BUTTON_END)
  )
    throw new Error('Missing/duplicate generated ActionButton boundary');
  return (
    source.slice(0, source.indexOf(ACTION_BUTTON_START)) +
    projection +
    source.slice(source.indexOf(ACTION_BUTTON_END) + ACTION_BUTTON_END.length)
  );
}
