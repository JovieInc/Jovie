/**
 * Single-image defect review: reviewImage(path, { model, transport }) -> findings[].
 *
 * Pure lib code: it makes no model call itself. The transport has the shape of
 * VisionTransport in scripts/design-ci-judge-dispatch.ts, so the subscription
 * CLI transport works. apps/web/scripts/visual-defects/provider-transport.ts
 * supplies the repo default (the providers scripts/screenshot-loop already
 * routes: ANTHROPIC_API_KEY, else AI_GATEWAY_API_KEY).
 */
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
  /** Required: lib code makes no model call itself. scripts/visual-defects/provider-transport.ts has the repo default. */
  readonly transport: DefectVisionTransport;
  /** One line about the surface, for example "Customers page, 375px wide". */
  readonly context?: string;
}

export class ReviewUnavailableError extends Error {}

export async function reviewImage(
  path: string,
  options: ReviewImageOptions
): Promise<DefectFinding[]> {
  const model = options.model ?? FAST_MODEL;
  const { transport } = options;
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
