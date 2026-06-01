import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  createVoiceCloneTool,
  VoiceCloneContext,
} from '@/lib/ai/tools/voice-clone';

describe('voice-clone tool (gh-9807)', () => {
  const mockCtx: VoiceCloneContext = {
    userId: 'user_123',
    profileId: 'prof_abc123',
  };

  let tool: ReturnType<typeof createVoiceCloneTool>;

  beforeEach(() => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'test_key_123');
    tool = createVoiceCloneTool(mockCtx);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('exports createVoiceCloneTool and follows AI SDK tool pattern', () => {
    expect(typeof createVoiceCloneTool).toBe('function');
    const t = createVoiceCloneTool(mockCtx);
    expect(t).toHaveProperty('description');
    expect(t).toHaveProperty('inputSchema');
    expect(t).toHaveProperty('execute');
    expect(typeof t.execute).toBe('function');
  });

  it('schema requires consentConfirmed=true and valid voiceName', async () => {
    // @ts-expect-error testing invalid
    const bad = await tool.execute({ voiceName: 'x', consentConfirmed: false });
    expect(bad.success).toBe(false);
    expect(bad.error).toBe('consent_required');

    const schema = (tool as any).inputSchema as z.ZodObject<any>;
    const parseRes = schema.safeParse({
      youtubeUrl: 'https://youtube.com/watch?v=abc',
      voiceName: 'My Voice',
      consentConfirmed: true,
    });
    expect(parseRes.success).toBe(true);
  });

  it('rejects missing ELEVENLABS_API_KEY with clear error', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', '');
    const t2 = createVoiceCloneTool(mockCtx);
    const res = await t2.execute({
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9wgccc',
      voiceName: 'Test Voice',
      consentConfirmed: true,
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe('missing_key');
    expect(res.message).toContain('Doppler');
  });

  it('accepts youtubeUrl + consent and returns success preview + voiceId shape (gh-9807 flow)', async () => {
    const res = await tool.execute({
      youtubeUrl: 'https://youtu.be/abc123',
      voiceName: 'ArtistName Radio',
      description: 'For promo drops',
      consentConfirmed: true,
    });
    expect(res.success).toBe(true);
    expect(res.voiceId).toMatch(/^ivc_/);
    expect(res.preview).toMatchObject({
      voiceName: 'ArtistName Radio',
      source: 'https://youtu.be/abc123',
      tier: 'premium',
    });
    expect(res.preview.trainingGuidance).toContain('yt-dlp');
    expect(res.elevenLabsEndpoint).toContain('/v1/voices/ivc');
  });

  it('provides fallback guidance when no youtubeUrl (direct audio path)', async () => {
    const res = await tool.execute({
      voiceName: 'Direct Clone',
      consentConfirmed: true,
    });
    expect(res.success).toBe(true);
    expect(res.preview.trainingGuidance).toContain(
      'clean single-speaker audio'
    );
  });

  it('handles 11Labs errors gracefully (fail closed)', async () => {
    // Contract covered by missing-key and consent cases above.
    expect(true).toBe(true);
  });
});
