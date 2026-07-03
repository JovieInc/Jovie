/**
 * Voice-stack bake-off runner (GitHub #12768).
 * Prints pinned script + cost model; optionally probes xAI WS when XAI_API_KEY is set.
 *
 *   doppler run --project jovie-web --config dev -- \
 *     pnpm --filter @jovie/web exec tsx scripts/voice-stack-bake-off-spike.ts
 *
 *   doppler run --project jovie-web --config dev -- \
 *     pnpm --filter @jovie/web exec tsx scripts/voice-stack-bake-off-spike.ts --probe-xai
 */
import {
  BAKE_OFF_FIVE_TURN_FLOW,
  BAKE_OFF_LOOKUP_RELEASE_TOOL,
  JOVIE_VOICE_PERSONA_PROMPT,
} from '@/lib/voice-stack-bake-off/test-script';
import { compareStacks } from '@/lib/voice-stack-bake-off/cost-model';

const probeXai = process.argv.includes('--probe-xai');

function printSection(title: string, body: string): void {
  console.log(`\n=== ${title} ===\n`);
  console.log(body);
}

async function probeXaiVoiceWs(): Promise<void> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    console.log(
      'XAI_API_KEY: not set — skip WS probe (human provisioning step).'
    );
    return;
  }

  const model = 'grok-voice-latest';
  const url = `wss://api.x.ai/v1/realtime?model=${model}`;
  const started = Date.now();

  try {
    const { default: WebSocket } = await import('ws');
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('xAI WS probe timed out after 15s'));
      }, 15_000);

      ws.on('open', () => {
        ws.send(
          JSON.stringify({
            type: 'session.update',
            session: {
              voice: 'ara',
              instructions: JOVIE_VOICE_PERSONA_PROMPT.slice(0, 500),
              turn_detection: { type: 'server_vad' },
            },
          })
        );
        ws.send(
          JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: BAKE_OFF_FIVE_TURN_FLOW[0]?.utterance ?? 'Hello',
                },
              ],
            },
          })
        );
        ws.send(JSON.stringify({ type: 'response.create' }));
      });

      ws.on('message', (data: Buffer) => {
        const event = JSON.parse(data.toString()) as { type?: string };
        if (
          event.type === 'response.output_audio.delta' ||
          event.type === 'response.audio.delta' ||
          event.type === 'response.done'
        ) {
          clearTimeout(timeout);
          const ttfaMs = Date.now() - started;
          console.log(`xAI WS probe: first audio/event in ${ttfaMs}ms`);
          ws.close();
          resolve();
        }
        if (event.type === 'error') {
          clearTimeout(timeout);
          reject(new Error(`xAI WS error: ${data.toString()}`));
        }
      });

      ws.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`xAI WS probe failed: ${message}`);
  }
}

async function main(): Promise<void> {
  printSection('Persona prompt', JOVIE_VOICE_PERSONA_PROMPT);

  printSection(
    'Mid-call tool',
    JSON.stringify(BAKE_OFF_LOOKUP_RELEASE_TOOL, null, 2)
  );

  printSection(
    '5-turn flow',
    BAKE_OFF_FIVE_TURN_FLOW.map(
      (t) =>
        `Turn ${t.turn} [${t.role}]: ${t.utterance}` +
        (t.expectsToolCall ? ` (expect tool: ${t.expectedToolName})` : '')
    ).join('\n')
  );

  const costs = compareStacks();
  printSection(
    'Fully-loaded $/min (USD)',
    [
      `${costs.xai.label}: $${costs.xai.fullyLoadedPerMin.toFixed(3)}/min`,
      `  voice $${costs.xai.voiceAgentPerMin} + telephony $${costs.xai.telephonyPerMin}`,
      `${costs.elevenLabsTwilio.label}: $${costs.elevenLabsTwilio.fullyLoadedPerMin.toFixed(3)}/min`,
      `  agent $${costs.elevenLabsTwilio.voiceAgentPerMin} + telephony $${costs.elevenLabsTwilio.telephonyPerMin.toFixed(4)} + LLM est $${costs.elevenLabsTwilio.llmPassThroughPerMin}`,
      `${costs.elevenLabsVapi.label}: $${costs.elevenLabsVapi.fullyLoadedPerMin.toFixed(3)}/min`,
      `xAI savings vs ElevenLabs+Twilio: $${costs.savingsVsElevenLabsTwilio.toFixed(3)}/min (~${Math.round((costs.savingsVsElevenLabsTwilio / costs.elevenLabsTwilio.fullyLoadedPerMin) * 100)}%)`,
    ].join('\n')
  );

  if (probeXai) {
    printSection('xAI WS latency probe', 'Connecting…');
    await probeXaiVoiceWs();
  } else {
    console.log(
      '\nTip: pass --probe-xai with XAI_API_KEY in env to measure time-to-first-audio.'
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});