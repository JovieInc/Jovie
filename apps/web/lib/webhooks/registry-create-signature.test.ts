import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  verifyGithubSignature,
  verifyVercelSignature,
} from './registry-create-signature';

const body = '{ "name": "new-thing", "unicode": "é" }';
const secret = 'test-webhook-secret';

describe.each([
  ['GitHub', verifyGithubSignature, 'sha256', 'sha256='],
  ['Vercel', verifyVercelSignature, 'sha1', ''],
] as const)('%s webhook signatures', (_provider, verify, algorithm, prefix) => {
  const digest = createHmac(algorithm, secret).update(body).digest('hex');
  const header = prefix + digest;

  it('accepts only the HMAC of the exact raw body and secret', () => {
    expect(verify(body, header, secret)).toBe(true);
    expect(verify(body, prefix + digest.toUpperCase(), secret)).toBe(true);
    expect(verify(`${body}\n`, header, secret)).toBe(false);
    expect(verify(body, header, 'wrong-secret')).toBe(false);
  });

  it.each([
    null,
    '',
    'not-hex',
    `sha1=${digest}`,
    `${prefix}${digest.slice(2)}`,
    `${prefix}${digest}aa`,
    `${prefix}${digest}z`,
    `${prefix}${digest.slice(0, -1)}z`,
    ` ${header}`,
    `${header}\n`,
  ])('rejects missing or malformed header %j', candidate => {
    expect(verify(body, candidate, secret)).toBe(false);
  });
});

it('requires the GitHub sha256= prefix', () => {
  const digest = createHmac('sha256', secret).update(body).digest('hex');
  expect(verifyGithubSignature(body, digest, secret)).toBe(false);
  expect(verifyGithubSignature(body, `SHA256=${digest}`, secret)).toBe(false);
});
