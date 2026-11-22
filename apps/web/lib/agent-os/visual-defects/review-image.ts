/**
 * Single-image defect review: reviewImage(path, { model }) -> findings[].
 *
 * This is the small API other tiers import (the fast pre-push check an agent
 * runs, the Visual Regression jury, the baseline gate). It adds no model
 * client of its own: the default transport drives the vision providers that
 * scripts/screenshot-loop/screenshot-bug-loop.mjs already routes (Anthropic
 * with ANTHROPIC_API_KEY, else the Vercel AI Gateway with AI_GATEWAY_API_KEY).
 * Any function with the VisionTransport shape that design-ci-judge-dispatch
 * uses works too, including the subscription CLI transport.
 *
 *   const findings = await reviewImage('shot.png', { model: 'claude-haiku-4-5' });
 *   if (findings.some(isBlockingFinding)) ...
 */
import { existsSync } from 'node:fs';
import {
  buildDefectPrompt,
  buildDefectSystemPrompt,
  type DefectFinding,
  parseDefectFindings,
} from './checklist';

/** Structurally the same as VisionTransport in scripts/design-ci-judge-dispatch.ts. */
export type DefectVisionTransport = (request: {
  readonly model: string;
  readonly system: string;
  readonly prompt: string;
  readonly images: readonly string[];
}) => Promise<string>;

export const FAST_MODEL = 'claude-haiku-4-5';
export const JURY_MODEL = 'claude-sonnet-5-5';

export interface ReviewImageOptions {
  readonly model?: string;
  readonly transport?: DefectVisionTransport;
  /** One line about the surface, for example "Customers page, 375px wide". */
  readonly context?: string;
}

export class ReviewUnavailableError extends Error {}

type ProviderModule = {
  defaultVisionProviders(env: Record<string, string | undefined>): Array<{
    name: string;
    available(): boolean;
    analyze(
      path: string,
      prompt: string
    ): Promise<{ ok: boolean; text?: string; reason?: string }>;
  }>;
};

export function hasVisionKey(
  env: Record<string, string | undefined> = process.env
): boolean {
  return Boolean(env.ANTHROPIC_API_KEY || env.AI_GATEWAY_API_KEY);
}

/** Default transport: the repo's existing vision providers, first reachable wins. */
export function providerTransport(
  env: Record<string, string | undefined> = process.env
): DefectVisionTransport {
  return async ({ model, system, prompt, images }) => {
    const mod = (await import(
      '../../../../../scripts/screenshot-loop/screenshot-bug-loop.mjs'
    )) as unknown as ProviderModule;
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

export async function reviewImage(
  path: string,
  options: ReviewImageOptions = {}
): Promise<DefectFinding[]> {
  if (!existsSync(path)) throw new Error(`screenshot not found: ${path}`);
  const model = options.model ?? FAST_MODEL;
  const transport = options.transport ?? providerTransport();
  const reply = await transport({
    model,
    system: buildDefectSystemPrompt(),
    prompt: buildDefectPrompt(options.context),
    images: [path],
  });
  const findings = parseDefectFindings(reply);
  if (!findings) throw new ReviewUnavailableError('unparseable review reply');
  return findings;
}
