import { describe, expect, it } from 'vitest';

import {
  encodeToolResult,
  float32ToPcm16Base64,
  parseServerMessage,
  pcm16Base64ToFloat32,
  pcmRateFromFormat,
  VoiceLatencyTracker,
} from './summer-voice-protocol';

describe('ElevenLabs agent messages', () => {
  it('parses metadata with the audio formats', () => {
    expect(
      parseServerMessage(
        JSON.stringify({
          type: 'conversation_initiation_metadata',
          conversation_initiation_metadata_event: {
            conversation_id: 'c1',
            agent_output_audio_format: 'pcm_24000',
            user_input_audio_format: 'pcm_16000',
          },
        })
      )
    ).toEqual({
      kind: 'metadata',
      conversationId: 'c1',
      outputRate: 24000,
      inputRate: 16000,
    });
    expect(pcmRateFromFormat('ulaw_8000')).toBe(16000);
  });

  it('parses audio, interruption, ping, transcript and tool calls', () => {
    expect(
      parseServerMessage(
        '{"type":"audio","audio_event":{"audio_base_64":"AAA="}}'
      )
    ).toEqual({ kind: 'audio', base64: 'AAA=' });
    expect(
      parseServerMessage(
        '{"type":"interruption","interruption_event":{"event_id":3}}'
      )
    ).toEqual({ kind: 'interruption' });
    expect(
      parseServerMessage(
        '{"type":"ping","ping_event":{"event_id":7,"ping_ms":10}}'
      )
    ).toEqual({ kind: 'ping', eventId: 7 });
    expect(
      parseServerMessage(
        '{"type":"user_transcript","user_transcription_event":{"user_transcript":"hi"}}'
      )
    ).toEqual({ kind: 'user-transcript', text: 'hi' });
    expect(
      parseServerMessage(
        '{"type":"client_tool_call","client_tool_call":{"tool_name":"ask_summer","tool_call_id":"t1","parameters":{"question":"how is shipping"}}}'
      )
    ).toEqual({
      kind: 'tool-call',
      name: 'ask_summer',
      toolCallId: 't1',
      question: 'how is shipping',
    });
  });

  it('ignores malformed and unknown messages', () => {
    expect(parseServerMessage('not json')).toBeNull();
    expect(parseServerMessage('{"type":"mystery"}')).toBeNull();
    expect(parseServerMessage('{"type":"audio","audio_event":{}}')).toBeNull();
  });

  it('encodes tool results with the call id', () => {
    expect(JSON.parse(encodeToolResult('t1', 'ok', false))).toEqual({
      type: 'client_tool_result',
      tool_call_id: 't1',
      result: 'ok',
      is_error: false,
    });
  });
});

describe('PCM16 conversion', () => {
  it('round-trips samples within quantization error and clamps', () => {
    const input = new Float32Array([0, 0.5, -0.5, 1, -1, 2]);
    const output = pcm16Base64ToFloat32(float32ToPcm16Base64(input));
    expect(output.length).toBe(input.length);
    expect(output[1]).toBeCloseTo(0.5, 3);
    expect(output[2]).toBeCloseTo(-0.5, 3);
    expect(output[5]).toBeCloseTo(1, 3);
  });
});

describe('VoiceLatencyTracker', () => {
  it('measures final transcript to first audio and skips interrupted turns', () => {
    const t = new VoiceLatencyTracker();
    expect(t.firstAudio(100)).toBeNull();
    t.userFinal(1000);
    expect(t.firstAudio(1900)).toBe(900);
    expect(t.firstAudio(2000)).toBeNull();
    t.userFinal(3000);
    t.interrupted();
    expect(t.firstAudio(3500)).toBeNull();
    t.userFinal(5000);
    t.firstAudio(5300);
    expect(t.snapshot()).toEqual({ count: 2, p50: 300, p95: 900 });
  });
});
