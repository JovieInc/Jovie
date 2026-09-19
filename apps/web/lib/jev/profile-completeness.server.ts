import 'server-only';

export type {
  EvaluationOptions,
  ProfileCompletenessAssessment,
  ProfileCompletenessInput,
} from '@jovie/jev-evaluation/server';
// Shared provider owns admission, revision binding, deadlines and model identity.
// This entrypoint neither dispatches jobs nor grants data/funding authority.
export {
  prepareProfileCompletenessRequest,
  runProfileCompletenessEvaluation,
} from '@jovie/jev-evaluation/server';
