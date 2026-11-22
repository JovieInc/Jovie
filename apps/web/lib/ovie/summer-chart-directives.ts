/**
 * Inline chart directives in Summer's Ovie replies.
 *
 * Summer ends a reply with a chart line (two open brackets, `chart`, a colon,
 * the metric id such as `revenue`, two close brackets) when Tim asks to see a
 * metric. Ovie strips the line and renders a summer.ops-card.v1 built
 * from live, registered sources (never numbers Summer wrote), following the
 * generative-views rule: compose canonical blocks bound to registered metric
 * ids, never model-written UI or queries (docs/architecture/generative-views.md).
 */

export const SUMMER_CHART_METRICS = ['revenue', 'users'] as const;
export type SummerChartMetric = (typeof SUMMER_CHART_METRICS)[number];

/** Maximum charts one reply may ask for. */
export const SUMMER_CHART_LIMIT = 2;

const DIRECTIVE_KEY = 'chart';
const DIRECTIVE = new RegExp(
  String.raw`\[\[${DIRECTIVE_KEY}:([a-z][a-z0-9-]{0,40})\]\]`,
  'giu'
);

function isChartMetric(value: string): value is SummerChartMetric {
  return (SUMMER_CHART_METRICS as readonly string[]).includes(value);
}

export interface SummerChartDirectives {
  /** The reply with every directive removed and spacing tidied. */
  readonly text: string;
  /** Registered metrics, in order, deduplicated, at most the limit. */
  readonly metrics: readonly SummerChartMetric[];
}

/**
 * Pull chart directives out of a reply. Unregistered ids are dropped from the
 * text too, so an unknown directive never leaks into the chat as raw markup.
 */
export function extractSummerChartDirectives(
  responseText: string
): SummerChartDirectives {
  const metrics: SummerChartMetric[] = [];
  for (const match of responseText.matchAll(DIRECTIVE)) {
    const id = (match[1] ?? '').toLowerCase();
    if (
      isChartMetric(id) &&
      !metrics.includes(id) &&
      metrics.length < SUMMER_CHART_LIMIT
    ) {
      metrics.push(id);
    }
  }
  if (responseText.match(DIRECTIVE) === null) {
    return { text: responseText, metrics };
  }
  const text = responseText
    .replace(DIRECTIVE, '')
    .replace(/[ \t]+$/gmu, '')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
  return { text, metrics };
}
