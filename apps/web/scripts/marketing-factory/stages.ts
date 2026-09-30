/**
 * Stage runner registry for factory:run (JOV-7276), in FACTORY_STAGES order.
 * A stage with no runner stops the run as `incomplete`.
 */

import type { FactoryStage } from '../../data/marketing/factory/spine';
import type { StageRunner } from './stage-kit';
import { CONTENT_STAGE_RUNNERS } from './stages-content';

export const FACTORY_STAGE_RUNNERS: Readonly<
  Partial<Record<FactoryStage, StageRunner>>
> = { ...CONTENT_STAGE_RUNNERS };
