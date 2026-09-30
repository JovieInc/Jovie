import PostalMime from 'postal-mime';

// Only the canary mailbox is permitted. This is not a general-purpose inbox.
export interface Env {
  OTP_STATE: KVNamespace;
  OTP_CHECK_TOKEN: string;
  OTP_CHECK_ORIGIN: string;
  CANARY_EMAIL: string;
  CANARY_FROM: string;
}

const TTL_MS = 300_000;
const MAX_MAIL_BYTES = 65_536;
const STATE_KEY = 'latest';

interface OtpState {
  otp: string;
  receivedAtMs: number;
  issuedAtMs: number;
}

function validConfig(env: Env): boolean {
  try {
    const origin = new URL(env.OTP_CHECK_ORIGIN);
    return (
      origin.protocol === 'https:' &&
      env.OTP_CHECK_ORIGIN === origin.origin &&
      /^[A-Za-z0-9_-]{32,256}$/.test(env.OTP_CHECK_TOKEN) &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.CANARY_EMAIL) &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.CANARY_FROM)
    );
  } catch {
    return false;
  }
}

async function boundedBody(
  stream: ReadableStream<Uint8Array> | null,
  max: number
) {
  if (!stream) throw new Error('Missing body');
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new Error('Body too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function authorized(
  header: string | null,
  token: string
): Promise<boolean> {
  if (!header?.startsWith('Bearer ') || header.length > 263) return false;
  const encode = new TextEncoder();
  const [actual, expected] = await Promise.all([
    crypto.subtle.digest('SHA-256', encode.encode(header.slice(7))),
    crypto.subtle.digest('SHA-256', encode.encode(token)),
  ]);
  const a = new Uint8Array(actual);
  const b = new Uint8Array(expected);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

function reply(status: number, body?: OtpState): Response {
  return new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    if (!validConfig(env)) {
      message.setReject('Canary unavailable');
      return;
    }
    if (message.to !== env.CANARY_EMAIL || message.rawSize > MAX_MAIL_BYTES) {
      message.setReject('Mail not accepted');
      return;
    }
    let state: OtpState;
    try {
      const bytes = await boundedBody(message.raw, MAX_MAIL_BYTES);
      const mail = await PostalMime.parse(bytes);
      const issuedAtMs = Date.parse(mail.date ?? '');
      const receivedAtMs = Date.now();
      // Date is checked independently of arrival, so delayed old mail cannot
      // satisfy a new run. The app still validates and consumes the actual OTP.
      if (
        mail.from?.address !== env.CANARY_FROM ||
        !Number.isFinite(issuedAtMs) ||
        issuedAtMs > receivedAtMs + 30_000 ||
        issuedAtMs < receivedAtMs - TTL_MS
      ) {
        throw new Error('Invalid sender or age');
      }
      const text = `${mail.subject ?? ''}\n${mail.text ?? ''}\n${mail.html ?? ''}`;
      const matches = [
        ...text.matchAll(/verification code[^\d]{0,80}(\d{6})(?!\d)/gi),
      ];
      const codes = new Set(matches.map(match => match[1]));
      if (codes.size !== 1) throw new Error('Missing or ambiguous code');
      state = { otp: [...codes][0], issuedAtMs, receivedAtMs };
    } catch {
      message.setReject('Mail not accepted');
      return;
    }
    // Never acknowledge receipt on failed persistence; the provider can retry.
    // No full messages, addresses, tokens, or OTPs are logged.
    await env.OTP_STATE.put(STATE_KEY, JSON.stringify(state), {
      expirationTtl: TTL_MS / 1000,
    });
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    if (!validConfig(env)) return reply(503);
    const url = new URL(request.url);
    if (
      url.origin !== env.OTP_CHECK_ORIGIN ||
      url.pathname !== '/latest' ||
      url.search
    ) {
      return reply(404);
    }
    if (request.method !== 'POST') return reply(405);
    if (
      !(await authorized(
        request.headers.get('Authorization'),
        env.OTP_CHECK_TOKEN
      ))
    ) {
      return reply(401);
    }
    let sinceMs: number;
    try {
      const data: unknown = JSON.parse(
        new TextDecoder().decode(await boundedBody(request.body, 1024))
      );
      if (
        !data ||
        typeof data !== 'object' ||
        !('email' in data) ||
        !('sinceMs' in data)
      ) {
        return reply(400);
      }
      if (data.email !== env.CANARY_EMAIL) return reply(403);
      if (typeof data.sinceMs !== 'number' || !Number.isFinite(data.sinceMs))
        return reply(400);
      sinceMs = data.sinceMs;
      if (sinceMs > Date.now() || sinceMs < Date.now() - TTL_MS)
        return reply(400);
    } catch {
      return reply(400);
    }
    try {
      const state = await env.OTP_STATE.get<OtpState>(STATE_KEY, 'json');
      const now = Date.now();
      if (
        !state ||
        !/^\d{6}$/.test(state.otp) ||
        !Number.isFinite(state.receivedAtMs) ||
        !Number.isFinite(state.issuedAtMs) ||
        state.receivedAtMs < sinceMs ||
        state.receivedAtMs > now ||
        state.issuedAtMs < Math.floor(sinceMs / 1000) * 1000 ||
        state.issuedAtMs > now + 30_000 ||
        state.receivedAtMs < now - TTL_MS
      ) {
        return reply(404);
      }
      return reply(200, state);
    } catch {
      return reply(503);
    }
  },
} satisfies ExportedHandler<Env>;
