import 'server-only';

import { createReleaseToRevenueRun } from './create-run';
import {
  isDesignPartnerUser,
  resolveDesignPartnerConfig,
} from './design-partner-config';
import {
  resolveReleaseMetadataFromCatalog,
  resolveReleaseMetadataFromManual,
} from './release-metadata';
import type {
  CreateReleaseToRevenueRunResult,
  NewReleaseTriggerInput,
  ReleaseToRevenueRunStepOutputs,
} from './types';

export type TriggerNewReleaseErrorCode =
  | 'feature-disabled'
  | 'design-partner-not-configured'
  | 'forbidden'
  | 'invalid-payload'
  | 'release-not-found';

export type TriggerNewReleaseResult =
  | {
      readonly ok: true;
      readonly run: CreateReleaseToRevenueRunResult;
      readonly stepOutputs: ReleaseToRevenueRunStepOutputs;
    }
  | {
      readonly ok: false;
      readonly code: TriggerNewReleaseErrorCode;
      readonly message: string;
    };

export async function triggerNewRelease(input: {
  readonly userId: string;
  readonly enabled: boolean;
  readonly trigger: NewReleaseTriggerInput;
}): Promise<TriggerNewReleaseResult> {
  if (!input.enabled) {
    return {
      ok: false,
      code: 'feature-disabled',
      message: 'Release-to-Revenue autopilot is not enabled for this account.',
    };
  }

  const designPartner = await resolveDesignPartnerConfig();
  if (!designPartner) {
    return {
      ok: false,
      code: 'design-partner-not-configured',
      message: 'Design partner artist is not configured in this environment.',
    };
  }

  if (!isDesignPartnerUser(input.userId, designPartner)) {
    return {
      ok: false,
      code: 'forbidden',
      message:
        'Only the configured design-partner artist can trigger autopilot runs.',
    };
  }

  let releaseMetadata;
  if (input.trigger.triggerSource === 'catalog') {
    releaseMetadata = await resolveReleaseMetadataFromCatalog({
      creatorProfileId: designPartner.creatorProfileId,
      creatorUsername: designPartner.creatorUsername,
      releaseId: input.trigger.releaseId,
    });
    if (!releaseMetadata) {
      return {
        ok: false,
        code: 'release-not-found',
        message: 'Release was not found for the design-partner catalog.',
      };
    }
  } else {
    const title = input.trigger.title?.trim() ?? '';
    if (title.length === 0) {
      return {
        ok: false,
        code: 'invalid-payload',
        message: 'Manual release triggers require a non-empty title.',
      };
    }

    releaseMetadata = resolveReleaseMetadataFromManual(
      input.trigger,
      designPartner.creatorUsername
    );
  }

  const stepOutputs: ReleaseToRevenueRunStepOutputs = {
    releaseId: releaseMetadata.releaseId ?? null,
    triggerSource: input.trigger.triggerSource,
    triggeredAt: new Date().toISOString(),
    designPartner,
    release: releaseMetadata,
  };

  const run = await createReleaseToRevenueRun({
    userId: input.userId,
    designPartner,
    stepOutputs,
  });

  return {
    ok: true,
    run,
    stepOutputs,
  };
}
