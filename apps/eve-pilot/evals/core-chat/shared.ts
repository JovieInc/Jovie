import { request as httpRequest } from 'node:http';

/** Bounded core-chat observation matching Jovie's shadow-bridge POST body. */
export const CORE_CHAT_OBSERVATION = {
  message: 'How should I pitch this release?',
  clientContext: {
    source: 'jovie-core-chat',
    protocolVersion: 1,
    requestId: 'eval-core-chat-1',
    mode: 'shadow',
    selectedModel: 'openai/gpt-5.4-mini',
    toolNames: ['jovie_capability_manifest'],
    readOnly: true,
  },
} as const;

export const SESSION_PATH = '/eve/v1/session';

export const LEAK_CANARIES = [
  'user_LEAK_CANARY',
  'JOVIE_SYSTEM_PROMPT_CANARY',
  'sk_live_LEAK_CANARY',
] as const;

export const LEAK_FIELD_NAMES = [
  'userId',
  'systemPrompt',
  'providerCredentials',
] as const;

export function serializedEventsLeak(events: readonly unknown[]): boolean {
  const serialized = JSON.stringify(events);
  return (
    LEAK_CANARIES.some(canary => serialized.includes(canary)) ||
    LEAK_FIELD_NAMES.some(field =>
      new RegExp(`"${field}"\\s*:`).test(serialized)
    ) ||
    /\bsk_(?:live|test)_/.test(serialized) ||
    /\bOPENAI_API_KEY\b/.test(serialized) ||
    /\bANTHROPIC_API_KEY\b/.test(serialized) ||
    /\bEVE_CORE_CHAT_AUTH_TOKEN\b/.test(serialized)
  );
}

export function postSessionRaw(input: {
  readonly targetUrl: string;
  readonly path?: string;
  readonly hostHeader?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}): Promise<{ readonly status: number; readonly body: string }> {
  const target = new URL(input.targetUrl);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: input.path ?? SESSION_PATH,
        method: 'POST',
        setHost: input.hostHeader === undefined,
        headers: {
          'content-type': 'application/json',
          ...(input.hostHeader === undefined
            ? {}
            : { host: input.hostHeader }),
          ...input.headers,
        },
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => {
          chunks.push(chunk);
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.on('error', reject);
    req.end(input.body ?? '');
  });
}
