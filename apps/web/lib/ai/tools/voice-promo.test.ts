import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVoicePromoTool, type VoicePromoResult } from './voice-promo';

/**
 * Outcome check for chat's voice promo ask (chat-creative, JOV-14474),
 * registered in docs/product/outcome-coverage.json: "make a radio drop in my
 * voice" must come back as playable audio from the artist's cloned voice.
 * ElevenLabs is stubbed at fetch, so it costs nothing to run.
 */

type Execute = (input: Record<string, unknown>) => Promise<VoicePromoResult>;

const voicePromo = createVoicePromoTool({
  profileId: 'profile-1',
  artistName: 'Night Bus',
}).execute as unknown as Execute;

const VOICE_ID = 'cloned-voice-1234';
const AUDIO = Buffer.from('ID3-fake-mpeg-bytes');

describe('voicePromo chat tool', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-elevenlabs-key');
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("a radio drop made in chat comes back as playable audio in the artist's voice", async () => {
    fetchMock.mockResolvedValue(new Response(AUDIO, { status: 200 }));

    const result = await voicePromo({
      voiceId: VOICE_ID,
      text: 'This is Night Bus, and you are tuned in',
      targetStation: 'KCRW',
      modelId: 'eleven_turbo_v2_5',
    });

    expect(result.error).toBeUndefined();
    expect(result).toMatchObject({
      success: true,
      mimeType: 'audio/mpeg',
      voiceIdUsed: VOICE_ID,
      textUsed: 'This is Night Bus, and you are tuned in for KCRW',
    });
    expect(Buffer.from(result.audioBase64 ?? '', 'base64')).toEqual(AUDIO);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toMatchObject({
      text: 'This is Night Bus, and you are tuned in for KCRW',
      model_id: 'eleven_turbo_v2_5',
    });
  });

  it('says the voice is missing instead of returning silence', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 404 }));

    const result = await voicePromo({
      voiceId: VOICE_ID,
      text: 'Hello radio land',
      modelId: 'eleven_turbo_v2_5',
    });

    expect(result.success).toBe(false);
    expect(result.audioBase64).toBeUndefined();
    expect(result.error).toContain(`Voice ${VOICE_ID} not found`);
  });

  it('makes no call when ElevenLabs is not set up', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', '');

    const result = await voicePromo({
      voiceId: VOICE_ID,
      text: 'Hello radio land',
      modelId: 'eleven_turbo_v2_5',
    });

    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
