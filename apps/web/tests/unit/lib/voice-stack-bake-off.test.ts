import { describe, expect, it } from 'vitest';
import {
  compareStacks,
  ELEVENLABS_AGENT_PER_MIN,
  getElevenLabsTwilioCostBreakdown,
  getXaiCostBreakdown,
  XAI_TELEPHONY_PER_MIN,
  XAI_VOICE_PER_MIN,
} from '@/lib/voice-stack-bake-off/cost-model';
import {
  BAKE_OFF_FIVE_TURN_FLOW,
  BAKE_OFF_LOOKUP_RELEASE_TOOL,
  BAKE_OFF_TOOL_FIXTURE,
  executeBakeOffToolFixture,
  getBakeOffToolArgs,
  JOVIE_VOICE_PERSONA_PROMPT,
} from '@/lib/voice-stack-bake-off/test-script';

describe('voice-stack bake-off test script (gh-12768)', () => {
  it('exports a non-empty persona prompt', () => {
    expect(JOVIE_VOICE_PERSONA_PROMPT.length).toBeGreaterThan(100);
    expect(JOVIE_VOICE_PERSONA_PROMPT).toContain('Jovie');
  });

  it('defines exactly five turns with tool call on turn 3', () => {
    expect(BAKE_OFF_FIVE_TURN_FLOW).toHaveLength(5);
    const toolTurn = BAKE_OFF_FIVE_TURN_FLOW.find((t) => t.expectsToolCall);
    expect(toolTurn?.turn).toBe(3);
    expect(toolTurn?.expectedToolName).toBe('lookup_upcoming_release');
  });

  it('tool schema requires artistId', () => {
    expect(BAKE_OFF_LOOKUP_RELEASE_TOOL.name).toBe('lookup_upcoming_release');
    const params = BAKE_OFF_LOOKUP_RELEASE_TOOL.parameters as {
      required?: string[];
    };
    expect(params.required).toContain('artistId');
  });

  it('fixture tool returns stable release metadata', () => {
    const result = executeBakeOffToolFixture();
    expect(result).toEqual(BAKE_OFF_TOOL_FIXTURE);
    expect(getBakeOffToolArgs().artistId).toBe('artist_luna_waves_demo');
  });
});

describe('voice-stack bake-off cost model (gh-12768)', () => {
  it('xAI fully-loaded rate matches public $0.06/min list price', () => {
    const xai = getXaiCostBreakdown();
    expect(xai.fullyLoadedPerMin).toBeCloseTo(
      XAI_VOICE_PER_MIN + XAI_TELEPHONY_PER_MIN,
      5
    );
    expect(xai.fullyLoadedPerMin).toBeCloseTo(0.06, 5);
  });

  it('ElevenLabs + Twilio is more expensive than xAI bundle', () => {
    const comparison = compareStacks();
    expect(comparison.elevenLabsTwilio.fullyLoadedPerMin).toBeGreaterThan(
      comparison.xai.fullyLoadedPerMin
    );
    expect(comparison.savingsVsElevenLabsTwilio).toBeGreaterThan(0);
  });

  it('ElevenLabs agent minute uses current PAYG rate', () => {
    const el = getElevenLabsTwilioCostBreakdown();
    expect(el.voiceAgentPerMin).toBe(ELEVENLABS_AGENT_PER_MIN);
    expect(ELEVENLABS_AGENT_PER_MIN).toBe(0.08);
  });
});