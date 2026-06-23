import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifySlackRequestSignature(params: {
  readonly signingSecret: string;
  readonly timestamp: string;
  readonly signature: string;
  readonly rawBody: string;
  readonly maxAgeSeconds?: number;
}): boolean {
  const maxAgeSeconds = params.maxAgeSeconds ?? 60 * 5;
  const requestAge = Math.abs(
    Math.floor(Date.now() / 1000) - Number.parseInt(params.timestamp, 10)
  );
  if (!Number.isFinite(requestAge) || requestAge > maxAgeSeconds) {
    return false;
  }

  const base = `v0:${params.timestamp}:${params.rawBody}`;
  const digest = `v0=${createHmac('sha256', params.signingSecret)
    .update(base)
    .digest('hex')}`;

  try {
    const provided = Buffer.from(params.signature, 'utf8');
    const expected = Buffer.from(digest, 'utf8');
    return (
      provided.length === expected.length && timingSafeEqual(provided, expected)
    );
  } catch {
    return false;
  }
}
