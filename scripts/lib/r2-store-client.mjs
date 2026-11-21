// Credentialed client for the private R2 screenshot bucket: AWS SigV4 over R2's
// S3-compatible API using node:crypto only. Credentials come from the
// environment, never from the repo.
import { createHash, createHmac } from 'node:crypto';

export const DEFAULT_BUCKET = 'jovie-screenshots';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export const MISSING_CREDENTIALS =
  'R2 credentials missing: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY ' +
  `(bucket ${DEFAULT_BUCKET}; the store is private, there is no unauthenticated access).`;

/** R2 S3-API credentials from the environment, or null when any is unset. */
export function storeConfig(env = process.env) {
  const accountId = env.R2_ACCOUNT_ID;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) return null;
  if (!/^[0-9a-z]{8,64}$/i.test(accountId))
    throw new Error('R2_ACCOUNT_ID must be the Cloudflare account id');
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket: env.R2_SCREENSHOTS_BUCKET || DEFAULT_BUCKET,
  };
}

const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

/**
 * AWS Signature V4 `Authorization` header value. `headers` must hold every
 * header being signed (lower-case names), including host, x-amz-date and
 * x-amz-content-sha256.
 */
export function sigV4Authorization({
  method,
  path,
  headers,
  payloadHash,
  accessKeyId,
  secretAccessKey,
  region = 'auto',
  service = 's3',
  amzDate,
}) {
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names
    .map(name => `${name}:${String(headers[name]).trim()}\n`)
    .join('');
  const signedHeaders = names.join(';');
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${region}/${service}/aws4_request`;
  const canonicalRequest = [
    method,
    path,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const toSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256(canonicalRequest),
  ].join('\n');
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), service),
    'aws4_request'
  );
  const signature = createHmac('sha256', signingKey)
    .update(toSign)
    .digest('hex');
  return `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

/** Signed request to one object in the private bucket (GET, HEAD or PUT). */
export function storeRequest(
  config,
  method,
  key,
  { body, contentType, fetchImpl = fetch, now = new Date() } = {}
) {
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const path = `/${config.bucket}/${key}`;
  const amzDate = now.toISOString().replace(/[-:]|\.\d{3}/g, '');
  const payloadHash = sha256(body ?? '');
  const signed = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const authorization = sigV4Authorization({
    method,
    path,
    headers: signed,
    payloadHash,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    amzDate,
  });
  const { host: _host, ...sendable } = signed;
  return fetchImpl(`https://${host}${path}`, {
    method,
    headers: {
      ...sendable,
      authorization,
      ...(contentType ? { 'content-type': contentType } : {}),
    },
    body,
  });
}
