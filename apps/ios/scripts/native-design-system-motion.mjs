/**
 * Project web motion scalars (e.g. --scale-press) into JovieMotion.
 * Color projection stays in native-design-system.mjs; this owns the press/motion slice.
 * contrastRatio lives here only to keep the color checker under the size baseline.
 */
export const MOTION_START = '  // BEGIN GENERATED NATIVE MOTION';
export const MOTION_END = '  // END GENERATED NATIVE MOTION';

export function contrastRatio(foreground, background, opacity = 1) {
  const rgb = value =>
    value
      .slice(1)
      .match(/../g)
      .map(channel => Number.parseInt(channel, 16) / 255);
  const bg = rgb(background);
  const fg = rgb(foreground).map((v, i) => v * opacity + bg[i] * (1 - opacity));
  const weight = [0.2126, 0.7152, 0.0722];
  const luminance = channels =>
    channels.reduce(
      (sum, channel, index) =>
        sum +
        (channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4) *
          weight[index],
      0
    );
  const [low, high] = [luminance(fg), luminance(bg)].sort((a, b) => a - b);
  return (high + 0.05) / (low + 0.05);
}

/** Resolve one custom property from `:root` blocks only (not `:root.dark`). */
export function rootToken(css, name) {
  if (!name.startsWith('--'))
    throw new Error(`Native motion source must be a CSS token: ${name}`);
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const found = [];
  for (const match of stripped.matchAll(/:root(?!\.)\s*\{([^}]+)\}/g)) {
    for (const token of match[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      if (token[1] === name) found.push(token[2].trim());
    }
  }
  if (found.length === 0) throw new Error(`Missing root token: ${name}`);
  if (new Set(found).size !== 1)
    throw new Error(`Conflicting root token: ${name}`);
  return found[0];
}

export function projectedMotion(bindings, css) {
  if (!Array.isArray(bindings) || bindings.length === 0)
    throw new Error('Native motion bindings required');
  const names = new Set();
  const lines = [];
  for (const binding of bindings) {
    if (
      !Array.isArray(binding) ||
      binding.length !== 2 ||
      typeof binding[1] !== 'string'
    )
      throw new Error(
        'Ambiguous native motion mapping: expected [name, css token]'
      );
    const [name, source] = binding;
    if (!/^[a-zA-Z]\w*$/.test(name) || names.has(name))
      throw new Error(`Duplicate/invalid native motion mapping: ${name}`);
    names.add(name);
    const value = rootToken(css, source);
    if (!/^(?:0?\.\d+|1(?:\.0+)?)$/.test(value))
      throw new Error(`Unsupported motion scalar: ${source}=${value}`);
    lines.push(
      `  /// Source: ${source}`,
      `  static let ${name}: CGFloat = ${value}`
    );
  }
  return `${MOTION_START}\n${lines.join('\n')}\n${MOTION_END}`;
}

export function replaceMotionProjection(source, projection) {
  const starts = source.split(MOTION_START).length - 1;
  const ends = source.split(MOTION_END).length - 1;
  if (
    starts !== 1 ||
    ends !== 1 ||
    source.indexOf(MOTION_START) > source.indexOf(MOTION_END)
  )
    throw new Error('Missing/duplicate generated motion boundary');
  return (
    source.slice(0, source.indexOf(MOTION_START)) +
    projection +
    source.slice(source.indexOf(MOTION_END) + MOTION_END.length)
  );
}
