import { DESIGN_TASTE_SWEEP_MODEL } from '@/lib/constants/ai-models';
import type { GoldenJourneyRoute } from './routes';
import {
  type GoldenJourneyJuryResult,
  GoldenJourneyJuryResultSchema,
} from './types';

const JURY_SYSTEM_PROMPT = [
  'You are a senior product-design reviewer for Jovie, a premium music-artist',
  'platform whose UI register is Linear-like: compact, quiet, precise.',
  'You are shown a screenshot of a real route captured after a deploy, and',
  '(when available) the previous accepted baseline of the same route.',
  'Judge whether anything is visually broken, janky, misaligned, clipped,',
  'overlapping, unstyled, placeholder-looking, or off-brand — and whether the',
  'change relative to the baseline is an improvement or a regression.',
  'Verdicts: "broken" = something is visibly wrong on first sight;',
  '"regression" = worse than the baseline but functional;',
  '"neutral" = expected/no meaningful change; "improvement" = better.',
  'Content that is SUPPOSED to change (dates, dynamic data, imagery) is not a',
  'finding. Report only what a founder would flag as jank.',
].join(' ');

export interface GoldenJourneyJuryEvaluation {
  readonly model: string;
  readonly result: GoldenJourneyJuryResult;
}

/**
 * Evaluate a captured route screenshot with the design-taste jury model via
 * the AI SDK gateway chokepoint. Callers gate invocation on gateway
 * availability; this function assumes credentials are present.
 */
export async function evaluateRouteWithJury(params: {
  readonly route: GoldenJourneyRoute;
  readonly current: Buffer;
  readonly golden: Buffer | null;
  readonly model?: string;
}): Promise<GoldenJourneyJuryEvaluation> {
  // Lazy-load so deterministic paths (tests, compare-only runs) never touch
  // the gateway module.
  const { gateway, generateObject } = await import('@/lib/ai/sdk');
  const model = params.model ?? DESIGN_TASTE_SWEEP_MODEL;

  const content: Array<
    { type: 'text'; text: string } | { type: 'image'; image: Buffer }
  > = [
    {
      type: 'text',
      text: [
        `Route: ${params.route.path} (${params.route.id})`,
        `State: ${params.route.authState}`,
        `Surface: ${params.route.description}`,
        'Current post-deploy capture:',
      ].join('\n'),
    },
    { type: 'image', image: params.current },
  ];

  if (params.golden) {
    content.push(
      { type: 'text', text: 'Previous accepted baseline for comparison:' },
      { type: 'image', image: params.golden }
    );
  } else {
    content.push({
      type: 'text',
      text: 'No baseline exists yet — judge the capture on its own.',
    });
  }

  const { object } = await generateObject({
    model: gateway(model),
    schema: GoldenJourneyJuryResultSchema,
    system: JURY_SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
  });

  return { model, result: object };
}
