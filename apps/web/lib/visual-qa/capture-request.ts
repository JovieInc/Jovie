import { VISUAL_QA_PHASES, type VisualQaPhase } from '@/lib/visual-qa/types';

export type VisualQaCapturePhaseRequest = VisualQaPhase | 'both';

export interface VisualQaCaptureRequest {
  readonly runId: string;
  readonly phases: readonly VisualQaPhase[];
  readonly surfaceIds: readonly string[];
}

const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/i;

function parsePhaseToken(value: string): VisualQaCapturePhaseRequest {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'both') {
    return 'both';
  }

  if ((VISUAL_QA_PHASES as readonly string[]).includes(normalized)) {
    return normalized as VisualQaPhase;
  }

  throw new Error(
    `Invalid Visual QA phase "${value}". Expected baseline, after, or both.`
  );
}

export function resolveVisualQaCapturePhases(
  phase: VisualQaCapturePhaseRequest
): readonly VisualQaPhase[] {
  return phase === 'both' ? [...VISUAL_QA_PHASES] : [phase];
}

export function parseVisualQaCaptureRequest(input: {
  readonly runId?: string | null;
  readonly phase?: string | null;
  readonly surfaces?: string | null;
}): VisualQaCaptureRequest {
  const runId = input.runId?.trim() ?? '';
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error(
      'Visual QA capture requires a run id matching /^[a-z0-9][a-z0-9._-]{0,79}$/i.'
    );
  }

  const phase = parsePhaseToken(input.phase ?? 'both');
  const surfaceIds = (input.surfaces ?? '')
    .split(',')
    .map(surfaceId => surfaceId.trim())
    .filter(surfaceId => surfaceId.length > 0);

  return {
    runId,
    phases: resolveVisualQaCapturePhases(phase),
    surfaceIds,
  };
}
