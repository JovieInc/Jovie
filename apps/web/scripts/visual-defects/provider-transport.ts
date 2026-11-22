/**
 * Repo-default transport for lib/agent-os/visual-defects: drives the vision
 * providers scripts/screenshot-loop/screenshot-bug-loop.mjs already routes
 * (Anthropic with ANTHROPIC_API_KEY, else the Vercel AI Gateway with
 * AI_GATEWAY_API_KEY). It adds no model client of its own.
 *
 *   const findings = await reviewShot('shot.png');          // fast tier, Haiku
 *   const findings = await reviewShot('shot.png', { model: JURY_MODEL });
 */
import {
  type DefectVisionTransport,
  FAST_MODEL,
  type ReviewImageOptions,
  ReviewUnavailableError,
  reviewImage,
} from '../../lib/agent-os/visual-defects/review-image';

type Env = Record<string, string | undefined>;

interface VisionProvider {
  name: string;
  available(): boolean;
  analyze(
    path: string,
    prompt: string
  ): Promise<{ ok: boolean; text?: string; reason?: string }>;
}

export function hasVisionKey(env: Env = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY || env.AI_GATEWAY_API_KEY);
}

export function providerTransport(
  env: Env = process.env
): DefectVisionTransport {
  return async ({ model, system, prompt, images }) => {
    const mod = (await import(
      '../../../../scripts/screenshot-loop/screenshot-bug-loop.mjs'
    )) as unknown as {
      defaultVisionProviders(env: Env): VisionProvider[];
    };
    const providers = mod.defaultVisionProviders({
      ...env,
      AUX_VISION_MODEL: model,
      GATEWAY_VISION_MODEL: model.includes('/') ? model : `anthropic/${model}`,
      AUX_VISION_MAX_TOKENS: env.AUX_VISION_MAX_TOKENS ?? '1500',
    });
    const reasons: string[] = [];
    for (const provider of providers) {
      if (!provider.available()) continue;
      const result = await provider.analyze(
        images[0],
        `${system}\n\n${prompt}`
      );
      if (result.ok) return result.text ?? '';
      reasons.push(`${provider.name}:${result.reason}`);
    }
    throw new ReviewUnavailableError(
      reasons.length
        ? `vision providers failed (${reasons.join(', ')})`
        : 'no ANTHROPIC_API_KEY or AI_GATEWAY_API_KEY'
    );
  };
}

/** The one-call API for agents: review a screenshot with the repo's providers. */
export function reviewShot(
  path: string,
  options: Partial<ReviewImageOptions> = {}
) {
  return reviewImage(path, {
    model: FAST_MODEL,
    transport: providerTransport(),
    ...options,
  });
}
