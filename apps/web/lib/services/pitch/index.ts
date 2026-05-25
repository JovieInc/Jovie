export { buildPitchInput } from './build-pitch-input';
export {
  generatePitchDraft,
  generatePitches,
  truncateToLimit,
} from './pitch-generator';
export {
  buildPitchDraftSystemPrompt,
  buildPitchDraftUserPrompt,
  buildSystemPrompt,
  buildUserPrompt,
} from './prompts';
export {
  buildReleasePitchChatPrompt,
  buildTaskPitchChatPrompt,
  inferPitchDestinationFromText,
  isPitchRelatedText,
  normalizePitchPlatform,
  normalizePitchTarget,
  PITCH_PLATFORMS,
  PITCH_TARGET_OPTION_LABELS,
  PITCH_TARGET_OPTIONS_TEXT,
  PITCH_TARGETS,
  type PitchDestination,
  type PitchPlatform,
  type PitchTarget,
  resolvePitchDestination,
} from './targets';
export {
  type GeneratedPitchDraft,
  type GeneratedPitches,
  type PitchDraftGenerationResult,
  type PitchGenerationResult,
  type PitchInput,
  PLATFORM_LIMITS,
  type PlatformKey,
} from './types';
