/** Project button-contract ActionButton KEEP (28/44) into JovieActionButtonMetrics. */
export const ACTION_BUTTON_START = '  // BEGIN GENERATED NATIVE ACTION BUTTON';
export const ACTION_BUTTON_END = '  // END GENERATED NATIVE ACTION BUTTON';

export function contractNumber(source, name) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error(`Invalid export: ${name}`);
  const matches = [
    ...source.matchAll(
      new RegExp(`^export const ${name}\\s*=\\s*(\\d+)\\s*;`, 'gm')
    ),
  ];
  if (matches.length === 0) throw new Error(`Missing export: ${name}`);
  if (matches.length > 1) throw new Error(`Duplicate export: ${name}`);
  return Number(matches[0][1]);
}

export function projectedActionButton(bindings, contractSource) {
  if (!Array.isArray(bindings) || bindings.length === 0)
    throw new Error('ActionButton bindings required');
  const names = new Set();
  const lines = [];
  for (const binding of bindings) {
    if (
      !Array.isArray(binding) ||
      binding.length !== 2 ||
      typeof binding[1] !== 'string'
    )
      throw new Error('Ambiguous ActionButton mapping');
    const [name, source] = binding;
    if (!/^[a-zA-Z]\w*$/.test(name) || names.has(name))
      throw new Error(`Bad ActionButton mapping: ${name}`);
    names.add(name);
    lines.push(
      `  /// Source: ${source}`,
      `  static let ${name}: CGFloat = ${contractNumber(contractSource, source)}`
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
    throw new Error('Missing/duplicate ActionButton boundary');
  return (
    source.slice(0, source.indexOf(ACTION_BUTTON_START)) +
    projection +
    source.slice(source.indexOf(ACTION_BUTTON_END) + ACTION_BUTTON_END.length)
  );
}

export function nativeDesignFixturePaths(manifest, manifestPath) {
  return [
    manifestPath,
    manifest.palette,
    manifest.semantics,
    manifest.paintDebt,
    manifest.actionButtonContract,
  ];
}
