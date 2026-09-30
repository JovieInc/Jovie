/**
 * Factory providers (JOV-7276): the only place `factory:run` touches models,
 * renders or media. Stages call these through one interface so `--dry`
 * swaps in fixtures with no network and no CLI, and live mode reports
 * `credentials-unavailable` instead of faking an answer.
 */

import { type CopyTier, type JudgeTransport, selectJudges } from '@jovie/copy';
import type {
  ImageGenerationOutcome,
  ImageGenerationRequest,
} from '../marketing-media/image-adapter';
import type { FactoryPageBrief } from './brief';

export type GeneratedStage = 'outcomes' | 'narrative' | 'copy';

export interface GenerateRequest {
  readonly stage: GeneratedStage;
  readonly model: string;
  readonly system: string;
  readonly prompt: string;
  /** Failures from the previous attempt; empty on attempt 1. */
  readonly feedback: readonly string[];
  readonly attempt: number;
}

export type Unavailable = {
  readonly status: 'credentials-unavailable';
  readonly reason: string;
};

export type Generated = { readonly status: 'ok'; readonly value: unknown };

export type RenderMeasurement = {
  readonly status: 'ok';
  readonly cls: number;
  readonly lcpMs: number;
};

export interface FactoryProviders {
  readonly mode: 'dry' | 'live';
  /** Judge (and live generation) transport; null when nothing is reachable. */
  readonly transport: JudgeTransport | null;
  generate(request: GenerateRequest): Promise<Generated | Unavailable>;
  measureRender(route: string): Promise<RenderMeasurement | Unavailable>;
  generateAsset(
    request: ImageGenerationRequest
  ): Promise<ImageGenerationOutcome>;
  /** Judge panel. Defaults to @jovie/copy selectJudges (producer family excluded). */
  selectJudges(
    tier: CopyTier,
    generatorModel: string,
    available?: (model: string) => boolean
  ): string[];
  /** Receipt id for a model: dry runs prefix `fixture:` so no one mistakes them. */
  label(model: string): string;
  now(): Date;
}

/** A judge reply that satisfies both the copy rubric and the stage rubric. */
export const FIXTURE_PASS_VERDICT = JSON.stringify({
  scores: {
    outcome: 9,
    specificity: 9,
    economy: 9,
    voice: 9,
    truth: 9,
    safety: 9,
    human: 9,
  },
  confidence: 0.9,
  score: 0.9,
  verdict: 'pass',
  critique: [],
  unsupportedClaims: [],
});

export function fixtureTransport(
  reply: (request: { model: string; prompt: string }) => string = () =>
    FIXTURE_PASS_VERDICT
): JudgeTransport {
  const send: JudgeTransport = async request => reply(request);
  send.available = () => true;
  return send;
}

export function dryProviders(
  brief: FactoryPageBrief,
  overrides: Partial<FactoryProviders> = {}
): FactoryProviders {
  const dry = brief.dry;
  return {
    mode: 'dry',
    transport: fixtureTransport(),
    async generate(request) {
      if (!dry) {
        return {
          status: 'credentials-unavailable',
          reason: `brief has no dry fixture for ${request.stage}`,
        };
      }
      return { status: 'ok', value: dry[request.stage] };
    },
    async measureRender() {
      if (!dry) {
        return {
          status: 'credentials-unavailable',
          reason: 'brief has no dry render fixture',
        };
      }
      return { status: 'ok', ...dry.render };
    },
    async generateAsset(request) {
      return {
        status: 'generated',
        provider: 'fixture',
        model: 'fixture/image',
        bytes: new Uint8Array([0]),
        mime: 'image/png',
        width: request.width,
        height: request.height,
      };
    },
    selectJudges,
    label: model => `fixture:${model}`,
    now: () => new Date(`${brief.asOf}T00:00:00.000Z`),
    ...overrides,
  };
}

function parseJsonReply(raw: string): unknown {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('model reply had no JSON');
  return JSON.parse(raw.slice(start, end + 1));
}

/**
 * Live wiring: subscription CLIs for anthropic/openai, the AI Gateway for
 * allowlisted families. Render measurement and image generation are not
 * wired in this issue, so they report credentials-unavailable.
 */
export function liveProviders(
  transport: JudgeTransport | null,
  overrides: Partial<FactoryProviders> = {}
): FactoryProviders {
  return {
    mode: 'live',
    transport,
    async generate(request) {
      if (!transport || !(transport.available?.(request.model) ?? true)) {
        return {
          status: 'credentials-unavailable',
          reason: `${request.model} is not reachable from this machine`,
        };
      }
      const raw = await transport({
        model: request.model,
        system: request.system,
        prompt: request.prompt,
      });
      return { status: 'ok', value: parseJsonReply(raw) };
    },
    async measureRender(route) {
      return {
        status: 'credentials-unavailable',
        reason: `no render measurer for ${route}; screen-cert CLS/LCP capture is not wired yet`,
      };
    },
    async generateAsset() {
      return {
        status: 'credentials-unavailable',
        provider: 'none',
        reason: 'no image adapter wired for factory:run',
      };
    },
    selectJudges,
    label: model => model,
    now: () => new Date(),
    ...overrides,
  };
}
