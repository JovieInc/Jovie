/**
 * Fully-loaded $/min estimates for the voice-stack bake-off (GitHub #12768).
 * Sources cited in docs/product/voice-stack-bake-off-spike.md — update when pricing changes.
 */

export type VoiceStackCandidate =
  | 'xai-voice-agent'
  | 'elevenlabs-convai-twilio';

export interface StackCostBreakdown {
  readonly candidate: VoiceStackCandidate;
  readonly label: string;
  readonly voiceAgentPerMin: number;
  readonly telephonyPerMin: number;
  readonly llmPassThroughPerMin: number;
  readonly platformPerMin: number;
  readonly fullyLoadedPerMin: number;
  readonly notes: readonly string[];
}

/** xAI: $0.05/min realtime voice + $0.01/min telephony on provisioned number (Jul 2026 blog). */
export const XAI_VOICE_PER_MIN = 0.05;
export const XAI_TELEPHONY_PER_MIN = 0.01;

/** ElevenLabs ElevenAgents PAYG after May 2026 reduction. */
export const ELEVENLABS_AGENT_PER_MIN = 0.08;

/** Twilio US local inbound leg (receive). Outbound dial adds ~$0.014/min. */
export const TWILIO_INBOUND_PER_MIN = 0.0085;
export const TWILIO_OUTBOUND_PER_MIN = 0.014;

/**
 * LLM pass-through: ElevenLabs currently absorbs; blog warns eventual pass-through.
 * Conservative mid-call estimate for a short tool-using agent turn.
 */
export const ELEVENLABS_LLM_ESTIMATE_PER_MIN = 0.02;

/** Vapi orchestration layer if used instead of native ElevenLabs telephony. */
export const VAPI_HOSTING_PER_MIN = 0.05;

export function getXaiCostBreakdown(): StackCostBreakdown {
  return {
    candidate: 'xai-voice-agent',
    label: 'xAI Voice Agent Builder (bundled)',
    voiceAgentPerMin: XAI_VOICE_PER_MIN,
    telephonyPerMin: XAI_TELEPHONY_PER_MIN,
    llmPassThroughPerMin: 0,
    platformPerMin: 0,
    fullyLoadedPerMin: XAI_VOICE_PER_MIN + XAI_TELEPHONY_PER_MIN,
    notes: [
      'Speech-to-speech; LLM bundled in voice minute.',
      'Free provisioned number included per account.',
      'Beta (announced 2026-07-01).',
    ],
  };
}

export function getElevenLabsTwilioCostBreakdown(): StackCostBreakdown {
  const telephony = TWILIO_INBOUND_PER_MIN + TWILIO_OUTBOUND_PER_MIN / 2; // blended inbound-heavy artist calls
  return {
    candidate: 'elevenlabs-convai-twilio',
    label: 'ElevenLabs ConvAI + Twilio telephony',
    voiceAgentPerMin: ELEVENLABS_AGENT_PER_MIN,
    telephonyPerMin: telephony,
    llmPassThroughPerMin: ELEVENLABS_LLM_ESTIMATE_PER_MIN,
    platformPerMin: 0,
    fullyLoadedPerMin:
      ELEVENLABS_AGENT_PER_MIN + telephony + ELEVENLABS_LLM_ESTIMATE_PER_MIN,
    notes: [
      'ElevenAgents $0.08/min (PAYG, Jun 2026).',
      'LLM pass-through estimated; ElevenLabs may still absorb on some plans.',
      'Twilio blended ~inbound + half outbound leg.',
      'Reuses in-repo ElevenLabs voice-clone + promo TTS.',
    ],
  };
}

export function getElevenLabsVapiCostBreakdown(): StackCostBreakdown {
  return {
    candidate: 'elevenlabs-convai-twilio',
    label: 'ElevenLabs ConvAI + Vapi + Twilio transport',
    voiceAgentPerMin: ELEVENLABS_AGENT_PER_MIN,
    telephonyPerMin: TWILIO_INBOUND_PER_MIN,
    llmPassThroughPerMin: ELEVENLABS_LLM_ESTIMATE_PER_MIN,
    platformPerMin: VAPI_HOSTING_PER_MIN,
    fullyLoadedPerMin:
      VAPI_HOSTING_PER_MIN +
      ELEVENLABS_AGENT_PER_MIN +
      TWILIO_INBOUND_PER_MIN +
      ELEVENLABS_LLM_ESTIMATE_PER_MIN,
    notes: [
      'Matches proactive-outreach spike adopt path (Vapi over raw Twilio assembly).',
      'Higher $/min; more mature orchestration + transfer APIs.',
    ],
  };
}

export function compareStacks(): {
  readonly xai: StackCostBreakdown;
  readonly elevenLabsTwilio: StackCostBreakdown;
  readonly elevenLabsVapi: StackCostBreakdown;
  readonly savingsVsElevenLabsTwilio: number;
} {
  const xai = getXaiCostBreakdown();
  const elevenLabsTwilio = getElevenLabsTwilioCostBreakdown();
  const elevenLabsVapi = getElevenLabsVapiCostBreakdown();
  return {
    xai,
    elevenLabsTwilio,
    elevenLabsVapi,
    savingsVsElevenLabsTwilio:
      elevenLabsTwilio.fullyLoadedPerMin - xai.fullyLoadedPerMin,
  };
}
