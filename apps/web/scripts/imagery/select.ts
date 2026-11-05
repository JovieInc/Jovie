/** Argument parsing and plate selection for imagery:plate (pure, no IO). */
import {
  IMAGERY_STAGES,
  type ImageryStageSpec,
  stageForPlate,
} from '../../lib/imagery/stages';
import type { ImageryManifest } from './manifest';
import { hashPlateSpec } from './spec-hash.mjs';

export interface PlateArgs {
  readonly id: string | null;
  readonly stale: boolean;
}

export function parsePlateArgs(argv: readonly string[]): PlateArgs {
  let id: string | null = null;
  let stale = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--id') id = argv[(i += 1)] ?? null;
    else if (argv[i] === '--stale') stale = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!id && !stale) throw new Error('Pass --id <plateId> or --stale');
  return { id, stale };
}

export function selectPlates(
  args: PlateArgs,
  manifest: Pick<ImageryManifest, 'plates'>
): ImageryStageSpec[] {
  const stages = IMAGERY_STAGES as readonly ImageryStageSpec[];
  if (args.id) {
    const stage = stageForPlate(args.id);
    if (!stage) throw new Error(`Unknown plate: ${args.id}`);
    return [stage];
  }
  return stages.filter(
    stage => manifest.plates[stage.plate.id]?.specHash !== hashPlateSpec(stage)
  );
}
