/**
 * factory:run preflight (JOV-7276). Before a run calls any model, check that
 * every stage from `--from-stage` through publish has a runner, a reachable
 * producer, enough cross-family judges, and its non-model prerequisites
 * (render measurer, image generation). Pure: it reads the registry, the
 * brief and provider capabilities, and never sends a request.
 */

import {
  decideMedium,
  resolveMediaSourcing,
} from '../../data/marketing/factory/mediaDecision';
import {
  FACTORY_STAGES,
  type FactoryStage,
} from '../../data/marketing/factory/spine';
import {
  type MarketingCreativeRole,
  selectMarketingModelWithReceipt,
} from '../../data/marketing/generation';
import { isRegisteredMarketingCapture } from '../marketing-media/capture-adapter';
import type { FactoryPageBrief } from './brief';
import type { FactoryProviders } from './providers';
import type { StageRunner } from './stage-kit';

export interface PreflightIssue {
  readonly stage: FactoryStage;
  readonly code: 'no-runner' | 'credentials-unavailable';
  readonly reason: string;
}

const PRODUCER_ROLES: Partial<Record<FactoryStage, MarketingCreativeRole>> = {
  outcomes: 'narrative-architect',
  narrative: 'narrative-architect',
  copy: 'copy-compiler',
};

function producerFor(role: MarketingCreativeRole): string | null {
  return selectMarketingModelWithReceipt({ role }).candidate?.id ?? null;
}

function needsImageGeneration(brief: FactoryPageBrief): boolean {
  return brief.media.some(entry => {
    const sourcing = resolveMediaSourcing(
      decideMedium(entry.input),
      entry.input.evidence,
      {
        isRegisteredCapture: id => isRegisteredMarketingCapture(id),
        isCertifiedPenRef: () => false,
      }
    );
    return sourcing.kind === 'generation' || sourcing.kind === 'pen-ref';
  });
}

export function preflightFactoryRun(input: {
  readonly brief: FactoryPageBrief;
  readonly providers: FactoryProviders;
  readonly runners: Partial<Record<FactoryStage, StageRunner>>;
  readonly fromStage: FactoryStage;
}): PreflightIssue[] {
  const { brief, providers } = input;
  const transport = providers.transport;
  const available = (model: string) =>
    transport !== null && (transport.available?.(model) ?? true);
  const issues: PreflightIssue[] = [];
  const credentials = (stage: FactoryStage, reason: string) =>
    issues.push({ stage, code: 'credentials-unavailable', reason });
  const judges = (
    stage: FactoryStage,
    tier: 'flagship' | 'standard',
    producer: string,
    needed: number
  ) => {
    const seated = transport
      ? providers.selectJudges(tier, producer, available).length
      : 0;
    if (seated < needed) {
      credentials(
        stage,
        `${stage} needs ${needed} cross-family judge(s); seated ${seated}`
      );
    }
  };

  for (const stage of FACTORY_STAGES.slice(
    FACTORY_STAGES.indexOf(input.fromStage)
  )) {
    if (!input.runners[stage]) {
      issues.push({
        stage,
        code: 'no-runner',
        reason: `no runner for ${stage}`,
      });
      continue;
    }
    const role = PRODUCER_ROLES[stage];
    if (role) {
      const producer = producerFor(role);
      if (!producer) {
        credentials(stage, `no healthy ${role} model`);
        continue;
      }
      if (providers.mode === 'dry' && !brief.dry) {
        credentials(stage, `brief has no dry fixture for ${stage}`);
      } else if (providers.mode === 'live' && !available(producer)) {
        credentials(stage, `${producer} is not reachable from this machine`);
      }
      judges(stage, 'flagship', producer, 2);
    }
    if (stage === 'proof' && brief.proof.length > 0) {
      judges(stage, 'standard', '', 1);
    }
    if (stage === 'adversarial-trust') {
      judges(stage, 'flagship', producerFor('copy-compiler') ?? '', 2);
    }
    if (stage === 'render' && !providers.capabilities.renderMeasurer) {
      credentials(stage, 'no render measurer (CLS/LCP) is wired');
    }
    if (
      stage === 'asset' &&
      !providers.capabilities.imageGeneration &&
      needsImageGeneration(brief)
    ) {
      credentials(stage, 'the brief needs image generation and none is wired');
    }
  }
  return issues;
}
