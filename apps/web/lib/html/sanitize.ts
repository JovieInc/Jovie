const DANGEROUS_ELEMENTS = new Set([
  'base',
  'embed',
  'form',
  'iframe',
  'link',
  'meta',
  'object',
  'script',
  'style',
]);

const DANGEROUS_URL_ATTRIBUTES = new Set([
  'formaction',
  'href',
  'src',
  'xlink:href',
]);

function readTagName(rawTag: string): string {
  let index = 1;
  while (rawTag[index] === '/' || rawTag[index] === ' ') index += 1;

  const start = index;
  while (index < rawTag.length) {
    const char = rawTag[index];
    if (!char || char === ' ' || char === '\t' || char === '\n') break;
    if (char === '\r' || char === '/' || char === '>') break;
    index += 1;
  }

  return rawTag.slice(start, index).toLowerCase();
}

function findDangerousElementEnd(
  lowerHtml: string,
  tagName: string,
  fromIndex: number
): number {
  const closingStart = lowerHtml.indexOf(`</${tagName}`, fromIndex);
  if (closingStart === -1) return lowerHtml.length;

  const closingEnd = lowerHtml.indexOf('>', closingStart);
  return closingEnd === -1 ? lowerHtml.length : closingEnd + 1;
}

function readAttribute(
  rawTag: string,
  startIndex: number
): { endIndex: number; name: string; value: string | null } {
  let index = startIndex;
  while (rawTag[index] === ' ' || rawTag[index] === '\n') index += 1;
  while (rawTag[index] === '\t' || rawTag[index] === '\r') index += 1;

  const nameStart = index;
  while (index < rawTag.length) {
    const char = rawTag[index];
    if (!char || char === '=' || char === '>' || char === '/') break;
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') break;
    index += 1;
  }

  const name = rawTag.slice(nameStart, index);
  while (rawTag[index] === ' ' || rawTag[index] === '\n') index += 1;
  while (rawTag[index] === '\t' || rawTag[index] === '\r') index += 1;

  if (rawTag[index] !== '=') {
    return { endIndex: index, name, value: null };
  }

  index += 1;
  while (rawTag[index] === ' ' || rawTag[index] === '\n') index += 1;
  while (rawTag[index] === '\t' || rawTag[index] === '\r') index += 1;

  const quote = rawTag[index];
  if (quote === '"' || quote === "'") {
    index += 1;
    const valueStart = index;
    const valueEnd = rawTag.indexOf(quote, index);
    if (valueEnd === -1) {
      return {
        endIndex: rawTag.length,
        name,
        value: rawTag.slice(valueStart),
      };
    }

    return {
      endIndex: valueEnd + 1,
      name,
      value: rawTag.slice(valueStart, valueEnd),
    };
  }

  const valueStart = index;
  while (index < rawTag.length) {
    const char = rawTag[index];
    if (!char || char === ' ' || char === '\t' || char === '\n') break;
    if (char === '\r' || char === '>' || char === '/') break;
    index += 1;
  }

  return {
    endIndex: index,
    name,
    value: rawTag.slice(valueStart, index),
  };
}

function isSafeAttribute(name: string, value: string | null): boolean {
  const normalizedName = name.toLowerCase();
  if (!normalizedName) return false;
  if (normalizedName.startsWith('on')) return false;
  if (value === null) return true;
  if (!DANGEROUS_URL_ATTRIBUTES.has(normalizedName)) return true;

  const normalizedValue = value
    .trim()
    .toLowerCase()
    .replaceAll(/&#(?:(\d+)|x([0-9a-f]+));/gi, (_, dec, hex) =>
      String.fromCharCode(hex ? parseInt(hex, 16) : parseInt(dec, 10))
    );
  return (
    !normalizedValue.startsWith('javascript:') &&
    !normalizedValue.startsWith('data:')
  );
}

function sanitizeTag(rawTag: string): string {
  if (rawTag.startsWith('</')) return rawTag;
  if (rawTag.startsWith('<!--') || rawTag.startsWith('<!')) return '';
  if (rawTag.startsWith('<?')) return '';

  const tagName = readTagName(rawTag);
  if (!tagName) return '';

  let index = rawTag.toLowerCase().indexOf(tagName) + tagName.length;
  const attributes: string[] = [];

  while (index < rawTag.length) {
    const char = rawTag[index];
    if (!char || char === '>') break;
    if (char === '/') break;

    const attribute = readAttribute(rawTag, index);
    if (attribute.endIndex <= index) {
      index += 1;
      continue;
    }

    if (isSafeAttribute(attribute.name, attribute.value)) {
      attributes.push(rawTag.slice(index, attribute.endIndex));
    }
    index = attribute.endIndex;
  }

  const selfClosing = rawTag.endsWith('/>');
  return `<${tagName}${attributes.join('')}${selfClosing ? ' /' : ''}>`;
}

export function sanitizeServerHtml(html: string): string {
  const lowerHtml = html.toLowerCase();
  let sanitized = '';
  let index = 0;

  while (index < html.length) {
    const tagStart = html.indexOf('<', index);
    if (tagStart === -1) {
      sanitized += html.slice(index);
      break;
    }

    sanitized += html.slice(index, tagStart);
    const tagEnd = html.indexOf('>', tagStart);
    if (tagEnd === -1) break;

    const rawTag = html.slice(tagStart, tagEnd + 1);
    const tagName = readTagName(rawTag);
    if (DANGEROUS_ELEMENTS.has(tagName)) {
      index = rawTag.startsWith('</')
        ? tagEnd + 1
        : findDangerousElementEnd(lowerHtml, tagName, tagEnd + 1);
      continue;
    }

    sanitized += sanitizeTag(rawTag);
    index = tagEnd + 1;
  }

  return sanitized;
}

export function stripHtmlToText(html: string): string {
  const sanitized = sanitizeServerHtml(html);
  let text = '';
  let index = 0;

  while (index < sanitized.length) {
    const tagStart = sanitized.indexOf('<', index);
    if (tagStart === -1) {
      text += sanitized.slice(index);
      break;
    }

    text += `${sanitized.slice(index, tagStart)} `;
    const tagEnd = sanitized.indexOf('>', tagStart);
    if (tagEnd === -1) break;
    index = tagEnd + 1;
  }

  return text;
}
