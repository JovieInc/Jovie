import type { FundraisingRegistry } from '@/lib/investors/fundraising-registry';
import type { InvestorMetricsSnapshot } from '@/lib/investors/sourced-metrics';

export const YC_DECK_SECTION_IDS = [
  'problem',
  'solution',
  'traction',
  'market',
  'business-model',
  'team',
  'ask',
] as const;

export type YcDeckSectionId = (typeof YC_DECK_SECTION_IDS)[number];

export interface YcDeckSection {
  readonly id: YcDeckSectionId;
  readonly dominantSentence: string;
  readonly support: readonly string[];
}

function slideCopy(
  registry: FundraisingRegistry,
  id: string
): { dominantSentence: string; support: readonly string[] } | null {
  const slide = registry.coreSlides.find(candidate => candidate.id === id);
  if (!slide) return null;
  return {
    dominantSentence: slide.dominantSentence,
    support: slide.support,
  };
}

function riskAnswer(registry: FundraisingRegistry, id: string): string | null {
  const risk = registry.risks.find(candidate => candidate.id === id);
  return risk?.answer ?? null;
}

function tractionSection(
  registry: FundraisingRegistry,
  metrics: InvestorMetricsSnapshot
): YcDeckSection {
  if (metrics.stats.length === 0 || metrics.asOf === null) {
    return {
      id: 'traction',
      dominantSentence:
        riskAnswer(registry, 'traction') ??
        'No sourced company metric is available for this deck.',
      support: [],
    };
  }

  return {
    id: 'traction',
    dominantSentence: `Sourced company metrics as of ${metrics.asOf}.`,
    support: metrics.stats.map(
      stat =>
        `${stat.label}: ${stat.value} ${stat.unit} (${stat.sourceKind}, ${stat.sourceLabel}, observed ${stat.observedAt}).`
    ),
  };
}

/**
 * YC section order from the canonical registry plus sourced metrics.
 * Traction contains only stats the metrics snapshot already accepted.
 */
export function buildInvestorYcDeck(
  registry: FundraisingRegistry,
  metrics: InvestorMetricsSnapshot
): readonly YcDeckSection[] {
  const problem = slideCopy(registry, 'problem');
  const wedge = slideCopy(registry, 'wedge');
  const product = slideCopy(registry, 'product');
  const founder = slideCopy(registry, 'founder');
  const round = slideCopy(registry, 'round');
  const market = riskAnswer(registry, 'market');
  const businessModel = riskAnswer(registry, 'business-model');

  const sections: Array<YcDeckSection | null> = [
    problem ? { id: 'problem', ...problem } : null,
    wedge
      ? {
          id: 'solution',
          dominantSentence: wedge.dominantSentence,
          support: product
            ? [...wedge.support, product.dominantSentence]
            : wedge.support,
        }
      : null,
    tractionSection(registry, metrics),
    market ? { id: 'market', dominantSentence: market, support: [] } : null,
    businessModel
      ? {
          id: 'business-model',
          dominantSentence: businessModel,
          support: [],
        }
      : null,
    founder ? { id: 'team', ...founder } : null,
    round ? { id: 'ask', ...round } : null,
  ];

  return sections.filter(
    (section): section is YcDeckSection => section !== null
  );
}
