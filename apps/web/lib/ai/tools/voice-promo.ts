import { tool } from 'ai';
import { z } from 'zod';

/**
 * Voice Promo Tool (promotion.voice-promo per ai-skills-system.md design)
 *
 * Generates short promotional audio drops / radio station liners from a user's
 * cloned voice (ElevenLabs voice ID) + text/prompt.
 *
 * HOT ZONE for gh-9808: promo audio generation pipeline extension from cloned voice.
 * Reuses chat tool factory pattern (explicit, DRY with other tools).
 * 11Labs direct fetch (no new deps, pragmatic, complete for end-to-end gen).
 * Premium skill (aligns with design doc cost tier).
 *
 * Principles applied (verbatim from plan + gstack 6):
 * 1. Choose completeness: full execute path with error handling, metadata, usable output.
 * 2. Boil lakes: strictly this generation step only (no full clone UI, no F-04, no merch).
 * 3. Pragmatic: direct API call, base64 return for immediate play (storage follow-up).
 * 4. DRY: follows exact create*Tool + zod pattern from profile-edit / import-bio.
 * 5. Explicit: clear schema, comments, voice settings for promo (stability/clarity tuned).
 * 6. Bias toward action: small, testable, shippable unit; async job extension noted for later.
 */

export interface VoicePromoContext {
  readonly profileId: string;
  readonly artistName?: string | null;
  // Future: pass clonedVoiceId from profile if stored; for now tool accepts voiceId param.
}

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

export const voicePromoInputSchema = z.object({
  voiceId: z
    .string()
    .min(10)
    .describe(
      'ElevenLabs voice ID from a prior cloned voice (user must have completed cloning consent flow).'
    ),
  text: z
    .string()
    .min(3)
    .max(280)
    .describe(
      'The exact script / liner text to speak (e.g. "Hey this is [Artist] with a new drop for [Station] — check out my latest on Jovie"). Keep short for radio drop.'
    ),
  style: z
    .string()
    .max(120)
    .optional()
    .describe(
      'Optional style or delivery direction (e.g. "energetic radio DJ drop, slight reverb, upbeat").'
    ),
  targetStation: z
    .string()
    .max(80)
    .optional()
    .describe(
      'Optional target radio station / DJ name for personalization in prompt.'
    ),
  modelId: z
    .enum(['eleven_turbo_v2_5', 'eleven_multilingual_v2'])
    .optional()
    .default('eleven_turbo_v2_5')
    .describe(
      'ElevenLabs model. Turbo v2.5 for speed/low latency promo; multilingual for non-English.'
    ),
});

export type VoicePromoInput = z.infer<typeof voicePromoInputSchema>;

export interface VoicePromoResult {
  success: boolean;
  audioBase64?: string; // data:audio/mpeg;base64,...
  mimeType?: string;
  durationSecondsEstimate?: number;
  voiceIdUsed: string;
  textUsed: string;
  modelUsed: string;
  error?: string;
  costTier: 'premium';
  note?: string;
}

/**
 * Creates the voice-promo tool.
 * Called from chat route buildChatTools for paid plans.
 * "clone my voice" or "voice promo" or "radio drop" in user message triggers via system prompt.
 */
export function createVoicePromoTool(context: VoicePromoContext) {
  return tool({
    description:
      "Generate short promotional audio (radio station drop / liner) using the artist's cloned voice via ElevenLabs. " +
      'Use when the artist says "clone my voice", "make a voice promo", "radio drop", "DJ liner", or "promo audio from my voice". ' +
      'Requires a valid cloned voiceId (from prior 11Labs clone consent). Returns playable base64 audio + metadata. Premium feature.',
    inputSchema: voicePromoInputSchema,
    execute: async (args: VoicePromoInput): Promise<VoicePromoResult> => {
      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) {
        return {
          success: false,
          voiceIdUsed: args.voiceId,
          textUsed: args.text,
          modelUsed: args.modelId,
          costTier: 'premium',
          error:
            'ELEVENLABS_API_KEY not configured (ops: add to Doppler jovie-web/dev and restart).',
        };
      }

      // Build the text with optional style/station personalization (explicit, product-obsessed)
      let finalText = args.text.trim();
      if (args.targetStation || args.style) {
        const extras = [
          args.targetStation ? `for ${args.targetStation}` : '',
          args.style ? `(${args.style})` : '',
        ]
          .filter(Boolean)
          .join(' ');
        if (extras) {
          finalText = `${finalText} ${extras}`.trim();
        }
      }

      // ElevenLabs TTS request (pragmatic direct fetch, no SDK dep)
      // Voice settings tuned for clear promo/radio drop (stability + clarity + style)
      const body = {
        text: finalText,
        model_id: args.modelId,
        voice_settings: {
          stability: 0.75,
          similarity_boost: 0.85,
          style: 0.6,
          use_speaker_boost: true,
        },
      };

      try {
        const res = await fetch(
          `${ELEVENLABS_API_URL}/${encodeURIComponent(args.voiceId)}`,
          {
            method: 'POST',
            headers: {
              'xi-api-key': apiKey,
              'Content-Type': 'application/json',
              Accept: 'audio/mpeg',
            },
            body: JSON.stringify(body),
            // 30s timeout reasonable for short promo (<30s audio)
            signal: AbortSignal.timeout(30000),
          }
        );

        if (!res.ok) {
          const errText = await res.text().catch(() => 'unknown');
          // Common 11Labs errors surfaced explicitly
          if (res.status === 401 || res.status === 403) {
            return {
              success: false,
              voiceIdUsed: args.voiceId,
              textUsed: finalText,
              modelUsed: args.modelId,
              costTier: 'premium',
              error: `ElevenLabs auth error (${res.status}). Confirm API key has TTS + voice access and clone consent was granted for this voice.`,
            };
          }
          if (res.status === 404) {
            return {
              success: false,
              voiceIdUsed: args.voiceId,
              textUsed: finalText,
              modelUsed: args.modelId,
              costTier: 'premium',
              error: `Voice ${args.voiceId} not found or not accessible. Re-clone or check ElevenLabs dashboard for the voice ID.`,
            };
          }
          return {
            success: false,
            voiceIdUsed: args.voiceId,
            textUsed: finalText,
            modelUsed: args.modelId,
            costTier: 'premium',
            error: `ElevenLabs TTS failed (${res.status}): ${errText.slice(0, 200)}`,
          };
        }

        const arrayBuf = await res.arrayBuffer();
        const audioBase64 = Buffer.from(arrayBuf).toString('base64');
        const mimeType = 'audio/mpeg';

        // Rough duration estimate (promo clips are short; 11Labs returns no duration header easily)
        const bytesPerSecApprox = 16000; // ~128kbps mpeg rough
        const durationSecondsEstimate = Math.max(
          3,
          Math.round(arrayBuf.byteLength / bytesPerSecApprox)
        );

        return {
          success: true,
          audioBase64,
          mimeType,
          durationSecondsEstimate,
          voiceIdUsed: args.voiceId,
          textUsed: finalText,
          modelUsed: args.modelId,
          costTier: 'premium',
          note: 'Playable promo audio generated. For production: persist to release_assets + CDN + async job (see gh-9808 plan for webhook/cron extension). Cost tracked via ElevenLabs usage.',
        };
      } catch (err: unknown) {
        const e = err as { name?: string; message?: string };
        if (e.name === 'TimeoutError' || e.name === 'AbortError') {
          return {
            success: false,
            voiceIdUsed: args.voiceId,
            textUsed: finalText,
            modelUsed: args.modelId,
            costTier: 'premium',
            error:
              'ElevenLabs request timed out (>30s). Try shorter text or retry.',
          };
        }
        return {
          success: false,
          voiceIdUsed: args.voiceId,
          textUsed: finalText,
          modelUsed: args.modelId,
          costTier: 'premium',
          error: `Voice promo generation error: ${e.message || String(err)}`,
        };
      }
    },
  });
}
