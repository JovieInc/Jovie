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

const WHITESPACE = new Set([' ', '\t', '\n', '\r']);
const TOKEN_BREAK = new Set([' ', '\t', '\n', '\r', '=', '>', '/']);

function skipWhitespace(str: string, from: number): number {
  let i = from;
  while (WHITESPACE.has(str[i] as string)) i += 1;
  return i;
}

function readAttributeName(
  rawTag: string,
  from: number
): { end: number; name: string } {
  let index = from;
  while (index < rawTag.length) {
    const char = rawTag[index];
    if (!char || TOKEN_BREAK.has(char)) break;
    index += 1;
  }
  return { end: index, name: rawTag.slice(from, index) };
}

function readQuotedValue(
  rawTag: string,
  quote: string,
  from: number
): { endIndex: number; value: string } {
  const valueEnd = rawTag.indexOf(quote, from);
  if (valueEnd === -1) {
    return { endIndex: rawTag.length, value: rawTag.slice(from) };
  }
  return { endIndex: valueEnd + 1, value: rawTag.slice(from, valueEnd) };
}

function readUnquotedValue(
  rawTag: string,
  from: number
): { endIndex: number; value: string } {
  let index = from;
  while (index < rawTag.length) {
    const char = rawTag[index];
    if (!char || WHITESPACE.has(char) || char === '>' || char === '/') break;
    index += 1;
  }
  return { endIndex: index, value: rawTag.slice(from, index) };
}

function readAttribute(
  rawTag: string,
  startIndex: number
): { endIndex: number; name: string; value: string | null } {
  let index = skipWhitespace(rawTag, startIndex);

  const { end: nameEnd, name } = readAttributeName(rawTag, index);
  index = skipWhitespace(rawTag, nameEnd);

  if (rawTag[index] !== '=') {
    return { endIndex: index, name, value: null };
  }

  index = skipWhitespace(rawTag, index + 1);

  const quote = rawTag[index];
  if (quote === '"' || quote === "'") {
    const quoted = readQuotedValue(rawTag, quote, index + 1);
    return { endIndex: quoted.endIndex, name, value: quoted.value };
  }

  const unquoted = readUnquotedValue(rawTag, index);
  return { endIndex: unquoted.endIndex, name, value: unquoted.value };
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
    if (tagEnd === -1) {
      sanitized += html.slice(tagStart);
      break;
    }

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
