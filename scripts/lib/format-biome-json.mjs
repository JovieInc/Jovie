/**
 * JSON.stringify(..., null, 2) always expands arrays. Biome's JSON formatter
 * (line width 80) collapses a primitive array onto its key's line when that
 * line fits, and `biome check` fails the committed shipping-SLO snapshots
 * when it does. Print that shape directly so the generator output is stable
 * on runners that do not install Biome.
 */

const DEFAULT_LINE_WIDTH = 80;

function isPrimitive(value) {
  return value === null || typeof value !== 'object';
}

function flatPrimitiveArray(value) {
  if (!Array.isArray(value) || value.some(item => !isPrimitive(item))) {
    return null;
  }
  if (value.length === 0) return '[]';
  return `[${value.map(item => JSON.stringify(item)).join(', ')}]`;
}

function printArray(value, indent, lineWidth) {
  const pad = ' '.repeat(indent);
  const childPad = ' '.repeat(indent + 2);
  const items = value.map((item, index) => {
    const comma = index === value.length - 1 ? '' : ',';
    const flat = flatPrimitiveArray(item);
    if (
      flat !== null &&
      childPad.length + flat.length + comma.length <= lineWidth
    ) {
      return `${childPad}${flat}`;
    }
    if (isPrimitive(item)) return `${childPad}${JSON.stringify(item)}`;
    return `${childPad}${printNode(item, indent + 2, lineWidth)}`;
  });
  return `[\n${items.join(',\n')}\n${pad}]`;
}

function printObject(value, indent, lineWidth) {
  const keys = Object.keys(value);
  if (keys.length === 0) return '{}';
  const pad = ' '.repeat(indent);
  const childPad = ' '.repeat(indent + 2);
  const lines = keys.map((key, index) => {
    const comma = index === keys.length - 1 ? '' : ',';
    const prefix = `${childPad}${JSON.stringify(key)}: `;
    const child = value[key];
    const flat = flatPrimitiveArray(child);
    if (
      flat !== null &&
      prefix.length + flat.length + comma.length <= lineWidth
    ) {
      return `${prefix}${flat}`;
    }
    if (isPrimitive(child)) return `${prefix}${JSON.stringify(child)}`;
    return `${prefix}${printNode(child, indent + 2, lineWidth)}`;
  });
  return `{\n${lines.join(',\n')}\n${pad}}`;
}

function printNode(value, indent, lineWidth) {
  if (isPrimitive(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return printArray(value, indent, lineWidth);
  return printObject(value, indent, lineWidth);
}

/**
 * @param {unknown} value JSON data. Undefined object entries are dropped the
 *   same way JSON.stringify drops them.
 * @param {{ lineWidth?: number }} [options]
 * @returns {string} Biome-stable JSON with a trailing newline.
 */
export function formatBiomeJson(value, options = {}) {
  const lineWidth = options.lineWidth ?? DEFAULT_LINE_WIDTH;
  const normalized = JSON.parse(JSON.stringify(value ?? null));
  if (Array.isArray(normalized)) {
    const flat = flatPrimitiveArray(normalized);
    if (flat !== null && flat.length <= lineWidth) return `${flat}\n`;
  }
  return `${printNode(normalized, 0, lineWidth)}\n`;
}
