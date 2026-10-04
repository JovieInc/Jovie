import type { PlaybookStep } from './types';

export const RECORD_RESULTS_STEP_ID = 'record-results';

/**
 * Closes the loop on an iterative playbook. What this step records is what
 * the next run of the same playbook reads to aim wider (see iteration.ts).
 */
export function recordResultsStep(
  offsetDays: number,
  phase: string
): PlaybookStep {
  return {
    id: RECORD_RESULTS_STEP_ID,
    title: 'Record what this run reached',
    phase,
    offsetDays,
    owner: 'creator',
    priority: 'medium',
    explainerText:
      'Note reach, engagement and new followers for each channel, plus what worked. Your next run starts from these numbers and aims past them.',
  };
}
