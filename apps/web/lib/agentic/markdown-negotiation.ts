export type AgenticRepresentation = 'html' | 'markdown';

type MediaRange = {
  readonly type: string;
  readonly subtype: string;
  readonly quality: number;
  readonly specificity: number;
};

const HTML_MEDIA_TYPE = 'text/html';
const MARKDOWN_MEDIA_TYPE = 'text/markdown';

function parseQuality(value: string): number {
  const normalized = value.trim();

  // RFC 9110 limits q-values to 0 through 1 with no more than three decimal
  // places. Treat malformed values as refusal instead of accidentally
  // selecting the Markdown representation.
  if (!/^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(normalized)) {
    return 0;
  }

  return Number(normalized);
}

function parseAccept(accept: string | null): readonly MediaRange[] {
  if (!accept) {
    return [];
  }

  return accept
    .split(',')
    .map((item): MediaRange | null => {
      const [mediaType, ...parameters] = item.split(';');
      const [type, subtype] = mediaType.trim().toLowerCase().split('/');

      if (
        !type ||
        !subtype ||
        !/^[^\s/;,]+$/.test(type) ||
        !/^[^\s/;,]+$/.test(subtype) ||
        (type === '*' && subtype !== '*')
      ) {
        return null;
      }

      let quality = 1;
      for (const parameter of parameters) {
        const [name, ...valueParts] = parameter.split('=');
        if (name?.trim().toLowerCase() !== 'q') {
          continue;
        }

        quality = parseQuality(valueParts.join('='));
        break;
      }

      return {
        type,
        subtype,
        quality,
        specificity:
          type === '*' && subtype === '*' ? 0 : subtype === '*' ? 1 : 2,
      };
    })
    .filter((range): range is MediaRange => range !== null);
}

function effectiveQuality(
  ranges: readonly MediaRange[],
  mediaType: string
): { quality: number; specificity: number } {
  const [type, subtype] = mediaType.split('/');
  const matchingRanges = ranges
    .filter(
      range =>
        (range.type === '*' || range.type === type) &&
        (range.subtype === '*' || range.subtype === subtype)
    )
    .sort((left, right) => right.specificity - left.specificity);

  const match = matchingRanges[0];
  return match
    ? { quality: match.quality, specificity: match.specificity }
    : { quality: 0, specificity: -1 };
}

/**
 * Select the compact Markdown representation only when a client explicitly
 * prefers text/markdown over text/html. Wildcards remain HTML by default so
 * ordinary browser and generic HTTP clients keep receiving the canonical page.
 */
export function negotiateAgenticRepresentation(
  accept: string | null
): AgenticRepresentation {
  const ranges = parseAccept(accept);
  const markdown = effectiveQuality(ranges, MARKDOWN_MEDIA_TYPE);
  const html = effectiveQuality(ranges, HTML_MEDIA_TYPE);

  if (
    markdown.specificity === 2 &&
    markdown.quality > 0 &&
    markdown.quality > html.quality
  ) {
    return 'markdown';
  }

  return 'html';
}
