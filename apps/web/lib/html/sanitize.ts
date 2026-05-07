const DANGEROUS_ELEMENT_PATTERN =
  /<\s*(script|style|iframe|object|embed|link|meta|base|form)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
const VOID_DANGEROUS_ELEMENT_PATTERN =
  /<\s*(script|style|iframe|object|embed|link|meta|base|form)\b[^>]*\/?>/gi;
const EVENT_HANDLER_ATTR_PATTERN =
  /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const DANGEROUS_URL_ATTR_PATTERN =
  /\s+(href|src|xlink:href|formaction)\s*=\s*(?:(["'])\s*(?:javascript|data):[\s\S]*?\2|(?:javascript|data):[^\s>]+)/gi;
const HTML_TAG_PATTERN = /<[^>]*>/g;

export function sanitizeServerHtml(html: string): string {
  return html
    .replace(DANGEROUS_ELEMENT_PATTERN, '')
    .replace(VOID_DANGEROUS_ELEMENT_PATTERN, '')
    .replace(EVENT_HANDLER_ATTR_PATTERN, '')
    .replace(DANGEROUS_URL_ATTR_PATTERN, '');
}

export function stripHtmlToText(html: string): string {
  return sanitizeServerHtml(html).replace(HTML_TAG_PATTERN, ' ');
}
