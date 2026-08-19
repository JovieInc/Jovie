import type { MockModelRequest, MockModelResponse } from 'eve/evals';

const CAPABILITY_TOOL = 'jovie_capability_manifest';

const LEAK_PATTERNS: readonly {
  readonly id: string;
  readonly pattern: RegExp;
}[] = [
  { id: 'userId', pattern: /"userId"\s*:/ },
  { id: 'systemPrompt', pattern: /"systemPrompt"\s*:/ },
  { id: 'providerCredential', pattern: /\bsk_(?:live|test)_/ },
  { id: 'openaiKey', pattern: /\bOPENAI_API_KEY\b/ },
  { id: 'anthropicKey', pattern: /\bANTHROPIC_API_KEY\b/ },
  { id: 'routeToken', pattern: /\bEVE_CORE_CHAT_AUTH_TOKEN\b/ },
  { id: 'userCanary', pattern: /user_LEAK_CANARY/ },
  { id: 'promptCanary', pattern: /JOVIE_SYSTEM_PROMPT_CANARY/ },
  { id: 'credentialCanary', pattern: /sk_live_LEAK_CANARY/ },
];

function promptCorpus(request: MockModelRequest): string {
  return [
    ...request.messages.map(message => message.text),
    ...request.userMessages,
    request.lastUserMessage ?? '',
  ].join('\n');
}

function detectLeaks(request: MockModelRequest): string[] {
  const corpus = promptCorpus(request);
  return LEAK_PATTERNS.filter(({ pattern }) => pattern.test(corpus)).map(
    ({ id }) => id
  );
}

function capabilityToolName(request: MockModelRequest): string | undefined {
  return request.tools.find(
    tool => tool.name === CAPABILITY_TOOL || tool.name.endsWith(CAPABILITY_TOOL)
  )?.name;
}

function readOnlySummary(output: unknown): string {
  if (typeof output !== 'object' || output === null) {
    return 'Shadow observation recorded. writePerformed=unknown';
  }
  const record = output as Record<string, unknown>;
  return [
    'Shadow observation recorded.',
    `capability=${String(record.capability ?? 'unknown')}`,
    `mode=${String(record.mode ?? 'unknown')}`,
    `writePerformed=${String(record.writePerformed ?? 'unknown')}`,
    `externalAccess=${String(record.externalAccess ?? 'unknown')}`,
  ].join(' ');
}

/** Deterministic fixture used only so evals never call a live model provider. */
export function respondToJovieCoreChat(
  request: MockModelRequest
): MockModelResponse | string {
  const leaks = detectLeaks(request);
  if (leaks.length > 0) {
    return `LEAK_DETECTED ${leaks.join(',')}`;
  }

  const capabilityResult = request.toolResults.find(
    result =>
      result.name === CAPABILITY_TOOL || result.name.endsWith(CAPABILITY_TOOL)
  );
  if (capabilityResult) {
    return readOnlySummary(capabilityResult.output);
  }

  const toolName = capabilityToolName(request);
  if (!toolName) {
    return 'MISSING_CAPABILITY_TOOL';
  }

  return {
    toolCalls: [{ name: toolName, input: { capability: 'core_chat' } }],
  };
}
