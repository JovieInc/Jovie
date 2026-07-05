/**
 * Voice-stack bake-off runner (GitHub #12768).
 *
 * Validates the pinned test script and prints a scorecard template for live runs.
 * Live telephony + latency measurement requires API keys (human-provisioned).
 *
 *   doppler run --project jovie-web --config dev -- \
 *     pnpm tsx scripts/voice-stack-bake-off/run-bakeoff.ts
 *
 * Optional: --check-keys probes Doppler env without placing calls.
 */
import {
  assertPinnedFiveTurnFlow,
  loadBakeOffTestScript,
} from './validate-test-script';

type StackId = 'xai-voice-agent-builder' | 'elevenlabs-convai-twilio';

interface StackProbe {
  readonly id: StackId;
  readonly label: string;
  readonly apiKeyEnv: string;
  readonly telephonyBundled: boolean;
  readonly docsUrl: string;
}

const STACKS: readonly StackProbe[] = [
  {
    id: 'xai-voice-agent-builder',
    label: 'xAI Voice Agent Builder',
    apiKeyEnv: 'XAI_API_KEY',
    telephonyBundled: true,
    docsUrl:
      'https://docs.x.ai/developers/model-capabilities/audio/voice-agent',
  },
  {
    id: 'elevenlabs-convai-twilio',
    label: 'ElevenLabs ConvAI + Twilio',
    apiKeyEnv: 'ELEVENLABS_API_KEY',
    telephonyBundled: false,
    docsUrl: 'https://elevenlabs.io/docs/eleven-agents/overview',
  },
] as const;

function parseArgs(argv: string[]): { checkKeys: boolean } {
  return { checkKeys: argv.includes('--check-keys') };
}

function keyStatus(envName: string): 'set' | 'missing' {
  const value = process.env[envName];
  return value?.trim() ? 'set' : 'missing';
}

function printScorecardTemplate(): void {
  console.log('\n## Live bake-off checklist (same script, both stacks)\n');
  console.log(
    '| Axis | xAI Voice Agent Builder | ElevenLabs ConvAI + Twilio |'
  );
  console.log('| --- | --- | --- |');
  for (const axis of [
    'Voice quality / naturalness (human 1–5)',
    'Time-to-first-audio (ms)',
    'Turn latency p50/p95 (ms)',
    'Tool call reliability (turn 3)',
    'Interruption handling (turn 4)',
    'Inbound telephony',
    'Outbound telephony',
    'Number provisioning',
    'Transfer / hangup API',
    'Fully-loaded $/min',
    'API ergonomics (agent create + webhooks)',
  ]) {
    console.log(`| ${axis} | _pending_ | _pending_ |`);
  }
}

function main(): void {
  const { checkKeys } = parseArgs(process.argv.slice(2));
  const script = loadBakeOffTestScript();
  assertPinnedFiveTurnFlow(script);

  console.log(`Bake-off test script: ${script.issue} v${script.version}`);
  console.log(`Persona: ${script.persona.name} — ${script.persona.role}`);
  console.log(`Turns: ${script.turns.length} (pinned 5-turn flow)`);
  console.log(`Tools under test: ${script.tools.map(t => t.name).join(', ')}`);

  if (checkKeys) {
    console.log('\n## API key probe\n');
    for (const stack of STACKS) {
      const status = keyStatus(stack.apiKeyEnv);
      console.log(
        `- ${stack.label}: ${stack.apiKeyEnv}=${status}${stack.telephonyBundled ? ' (telephony bundled)' : ' (+ Twilio account required)'}`
      );
    }
    const anyMissing = STACKS.some(s => keyStatus(s.apiKeyEnv) === 'missing');
    if (anyMissing) {
      console.log(
        '\nBlocked: provision XAI_API_KEY and/or ELEVENLABS_API_KEY via Slack/Doppler before live calls.'
      );
      process.exitCode = 2;
    }
  }

  console.log('\n## Pinned caller script\n');
  for (const turn of script.turns) {
    const tag = turn.interruption ? ' [interrupt]' : '';
    console.log(`${turn.turn}. "${turn.utterance}"${tag}`);
  }

  printScorecardTemplate();
  console.log(
    '\nRecord results in docs/product/voice-stack-bake-off-spike.md after human voice QA.'
  );
}

main();
