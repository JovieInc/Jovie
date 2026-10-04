/**
 * Factory providers (JOV-7276): the only place `factory:run` touches models,
 * renders or media. Stages call these through one interface so `--dry`
 * swaps in fixtures with no network and no CLI, and live mode reports
 * `credentials-unavailable` instead of faking an answer.
 */

import { join } from 'node:path';
import { type CopyTier, type JudgeTransport, selectJudges } from '@jovie/copy';
import { pickRoleModel, visionAvailability } from '../design-ci-judge-dispatch';
import {
  type ArtGate,
  createArtEvaluatorGate,
} from '../marketing-media/generate-image';
import type {
  ImageGenerationOutcome,
  ImageGenerationRequest,
} from '../marketing-media/image-adapter';
import type { FactoryPageBrief } from './brief';
import { FACTORY_RUNS_DIR } from './receipts';
import {
  fixtureCaptures,
  liveRenderMeasurer,
  type RenderCapture,
  type RenderRequestOptions,
  renderOptionsFromEnv,
} from './render-measurer';
import {
  liveVisualJudges,
  runVisualReview,
  type VisualReviewOutcome,
  type VisualReviewRequest,
} from './visual-review';

export type GeneratedStage = 'outcomes' | 'narrative' | 'copy';

export interface GenerateRequest {
  readonly stage: GeneratedStage;
  readonly model: string;
  readonly system: string;
  readonly prompt: string;
  /** Failures from the previous attempt; empty on attempt 1. */
  readonly feedback: readonly string[];
  readonly attempt: number;
  /** Set when the stage asks for several distinct directions. */
  readonly direction?: { readonly index: number; readonly of: number };
}

export type Unavailable = {
  readonly status: 'credentials-unavailable';
  readonly reason: string;
};

export type Generated = { readonly status: 'ok'; readonly value: unknown };

export type RenderMeasurement = {
  readonly status: 'ok';
  /** Worst case across viewports. */
  readonly cls: number;
  readonly lcpMs: number;
  readonly captures: readonly RenderCapture[];
};

export interface FactoryProviders {
  readonly mode: 'dry' | 'live';
  /** Judge (and live generation) transport; null when nothing is reachable. */
  readonly transport: JudgeTransport | null;
  /** What this provider set can do, read by the preflight before any model call. */
  readonly capabilities: {
    readonly renderMeasurer: boolean;
    readonly imageGeneration: boolean;
  };
  generate(request: GenerateRequest): Promise<Generated | Unavailable>;
  measureRender(
    route: string,
    at?: RenderRequestOptions
  ): Promise<RenderMeasurement | Unavailable>;
  /** Cross-family vision review of the render stage's screenshots. */
  reviewVisual(request: VisualReviewRequest): Promise<VisualReviewOutcome>;
  generateAsset(
    request: ImageGenerationRequest
  ): Promise<ImageGenerationOutcome>;
  /** Model family of generateAsset, so the art judge can refuse to share it. */
  readonly imageFamily: string;
  /** Art evaluator every generated asset must pass (generate-image.ts). */
  readonly artGate: ArtGate;
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
    capabilities: { renderMeasurer: Boolean(dry), imageGeneration: true },
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
    async measureRender(route) {
      if (!dry) {
        return {
          status: 'credentials-unavailable',
          reason: 'brief has no dry render fixture',
        };
      }
      return {
        status: 'ok',
        ...dry.render,
        captures: fixtureCaptures(route, dry.render),
      };
    },
    async reviewVisual(request) {
      const judgeModel = fixtureVisionJudge(request.producerModel);
      if (!judgeModel) {
        return {
          status: 'credentials-unavailable',
          reason: 'no fixture vision judge outside the producer family',
        };
      }
      return {
        status: 'reviewed',
        judgeModel: `fixture:${judgeModel}`,
        verdict: 'pass',
        score: 0.9,
        findings: [],
        judges: [],
      };
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
    imageFamily: 'fixture',
    artGate: async () => ({
      ok: true,
      modes: ['focal'],
      judgeModel: 'fixture:openai/gpt-5.5',
      notes: ['focal: fixture pass'],
    }),
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

const WEB_APP_DIR = join(import.meta.dirname, '../..');
const FACTORY_RENDER_OUT_DIR = join(FACTORY_RUNS_DIR, 'render');

/** First vision judge outside the producer family, for dry runs. */
function fixtureVisionJudge(producerModel: string): string | null {
  return pickRoleModel('vision-judge', {
    available: visionAvailability(() => true),
    modality: 'vision',
    excludeFamilyOf: producerModel.replace(/^fixture:/u, ''),
  });
}

/**
 * Live wiring: subscription CLIs for anthropic/openai, the AI Gateway for
 * allowlisted families. Render measurement needs a served production build
 * (render-measurer.ts); image generation is not wired, so it reports
 * credentials-unavailable.
 */
export function liveProviders(
  transport: JudgeTransport | null,
  overrides: Partial<FactoryProviders> = {}
): FactoryProviders {
  const render = renderOptionsFromEnv(
    process.env,
    FACTORY_RENDER_OUT_DIR,
    WEB_APP_DIR
  );
  return {
    mode: 'live',
    capabilities: {
      // Only with a served build (or a local build) to measure.
      renderMeasurer: Boolean(render.baseUrl || render.build),
      imageGeneration: false,
    },
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
    measureRender: liveRenderMeasurer(render),
    async reviewVisual(request) {
      return runVisualReview(
        request,
        await liveVisualJudges(transport, request.producerModel)
      );
    },
    async generateAsset() {
      return {
        status: 'credentials-unavailable',
        provider: 'none',
        reason: 'no image adapter wired for factory:run',
      };
    },
    imageFamily: 'none',
    artGate: createArtEvaluatorGate(),
    selectJudges,
    label: model => model,
    now: () => new Date(),
    ...overrides,
  };
}
