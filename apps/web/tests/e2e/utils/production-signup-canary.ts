import type { Page } from '@playwright/test';

export const PRODUCTION_SIGNUP_CANARY_KEYS = [
  'E2E_PROD_SIGNUP_EMAIL_BASE',
  'E2E_PROD_SIGNUP_PASSWORD',
  'E2E_PROD_MAILBOX_PROVIDER',
  'CLERK_SECRET_KEY',
] as const;

const GMAIL_SIGNUP_CANARY_KEYS = [
  'E2E_PROD_MAILBOX_CLIENT_ID',
  'E2E_PROD_MAILBOX_CLIENT_SECRET',
  'E2E_PROD_MAILBOX_REFRESH_TOKEN',
] as const;

const CLOUDFLARE_OTP_SIGNUP_CANARY_KEYS = [
  'E2E_PROD_OTP_CHECK_URL',
  'E2E_PROD_OTP_CHECK_TOKEN',
] as const;

type ProductionSignupCanaryKey =
  | (typeof PRODUCTION_SIGNUP_CANARY_KEYS)[number]
  | (typeof GMAIL_SIGNUP_CANARY_KEYS)[number]
  | (typeof CLOUDFLARE_OTP_SIGNUP_CANARY_KEYS)[number];

type ProductionSignupMailboxProvider = 'gmail' | 'cloudflare-email-routing';

interface CanaryEnv {
  readonly [key: string]: string | undefined;
}

export interface ProductionSignupCanaryConfigResult {
  readonly ok: boolean;
  readonly missing: readonly ProductionSignupCanaryKey[];
  readonly summary: string;
}

interface GmailAccessTokenResponse {
  readonly access_token?: string;
  readonly expires_in?: number;
  readonly token_type?: string;
  readonly error?: string;
  readonly error_description?: string;
}

interface GmailListResponse {
  readonly messages?: Array<{ readonly id: string }>;
}

interface GmailMessagePart {
  readonly mimeType?: string;
  readonly body?: { readonly data?: string };
  readonly parts?: readonly GmailMessagePart[];
}

interface GmailMessage {
  readonly id: string;
  readonly snippet?: string;
  readonly internalDate?: string;
  readonly payload?: GmailMessagePart;
}

interface CloudflareOtpCheckResponse {
  readonly otp?: string | null;
  readonly code?: string | null;
  readonly text?: string | null;
  readonly receivedAtMs?: number | null;
}

function isProductionSignupMailboxProvider(
  value: string | undefined
): value is ProductionSignupMailboxProvider {
  return value === 'gmail' || value === 'cloudflare-email-routing';
}

function isMissing(env: CanaryEnv, key: ProductionSignupCanaryKey): boolean {
  const value = env[key];
  return typeof value !== 'string' || value.trim().length === 0;
}

export function validateProductionSignupCanaryConfig(
  env: CanaryEnv
): ProductionSignupCanaryConfigResult {
  const commonMissing = PRODUCTION_SIGNUP_CANARY_KEYS.filter(key =>
    isMissing(env, key)
  );
  const provider = env.E2E_PROD_MAILBOX_PROVIDER;
  const providerKeys: readonly ProductionSignupCanaryKey[] =
    provider === 'cloudflare-email-routing'
      ? CLOUDFLARE_OTP_SIGNUP_CANARY_KEYS
      : GMAIL_SIGNUP_CANARY_KEYS;
  const providerMissing =
    !provider || isProductionSignupMailboxProvider(provider)
      ? providerKeys.filter(key => isMissing(env, key))
      : [];
  const missing = [...commonMissing, ...providerMissing];
  const summaryKeys = [...PRODUCTION_SIGNUP_CANARY_KEYS, ...providerKeys];
  const lines = summaryKeys.map(
    key => `${key}: ${missing.includes(key) ? 'MISSING' : 'SET'}`
  );

  if (provider && !isProductionSignupMailboxProvider(provider)) {
    lines.push('E2E_PROD_MAILBOX_PROVIDER: INVALID');
    return {
      ok: false,
      missing,
      summary: lines.join('\n'),
    };
  }

  return {
    ok: missing.length === 0 && isProductionSignupMailboxProvider(provider),
    missing,
    summary: lines.join('\n'),
  };
}

export function buildProductionSignupEmail(
  baseEmail: string,
  runId: string
): string {
  const atIndex = baseEmail.indexOf('@');
  if (atIndex <= 0 || atIndex !== baseEmail.lastIndexOf('@')) {
    throw new Error(
      'E2E_PROD_SIGNUP_EMAIL_BASE must be a single email address'
    );
  }

  const local = baseEmail.slice(0, atIndex);
  const domain = baseEmail.slice(atIndex + 1);
  const safeRunId = runId
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return `${local}+${safeRunId || 'run'}@${domain}`;
}

export function extractClerkOtp(text: string): string | null {
  const codeMatch =
    text.match(
      /\b(?:code|verification code|one-time code)\D{0,40}(\d{3})[- ]?(\d{3})\b/i
    ) ?? text.match(/\b(\d{3})[- ]?(\d{3})\b/);

  if (!codeMatch?.[1] || !codeMatch[2]) return null;
  return `${codeMatch[1]}${codeMatch[2]}`;
}

async function fetchJsonWithTimeout<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  context: string
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`${context} failed: HTTP ${response.status} ${body}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchGmailAccessToken(env: CanaryEnv): Promise<string> {
  const body = new URLSearchParams({
    client_id: env.E2E_PROD_MAILBOX_CLIENT_ID ?? '',
    client_secret: env.E2E_PROD_MAILBOX_CLIENT_SECRET ?? '',
    refresh_token: env.E2E_PROD_MAILBOX_REFRESH_TOKEN ?? '',
    grant_type: 'refresh_token',
  });

  const response = await fetchJsonWithTimeout<GmailAccessTokenResponse>(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    },
    15_000,
    'Gmail OAuth refresh'
  );

  if (!response.access_token) {
    throw new Error(
      `Gmail OAuth refresh did not return an access token: ${
        response.error_description ?? response.error ?? 'unknown'
      }`
    );
  }

  return response.access_token;
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '='
  );
  return Buffer.from(padded, 'base64').toString('utf8');
}

function collectMessageText(part: GmailMessagePart | undefined): string {
  if (!part) return '';
  const body = part.body?.data ? decodeBase64Url(part.body.data) : '';
  const children = (part.parts ?? []).map(collectMessageText).join('\n');
  return `${body}\n${children}`.trim();
}

async function listGmailMessages(
  accessToken: string,
  query: string
): Promise<GmailListResponse> {
  const params = new URLSearchParams({ q: query, maxResults: '10' });
  return fetchJsonWithTimeout<GmailListResponse>(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    15_000,
    'Gmail list messages'
  );
}

async function getGmailMessage(
  accessToken: string,
  messageId: string
): Promise<GmailMessage> {
  const params = new URLSearchParams({ format: 'full' });
  return fetchJsonWithTimeout<GmailMessage>(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    15_000,
    `Gmail get message ${messageId}`
  );
}

async function waitForGmailProductionSignupOtp({
  email,
  env,
  startedAtMs,
  timeoutMs = 90_000,
}: {
  readonly email: string;
  readonly env: CanaryEnv;
  readonly startedAtMs: number;
  readonly timeoutMs?: number;
}): Promise<string> {
  const accessToken = await fetchGmailAccessToken(env);
  const fromQuery =
    env.E2E_PROD_MAILBOX_QUERY_FROM?.trim() || 'from:(clerk OR clerk.dev)';
  const query = `to:${email} newer_than:10m (${fromQuery} OR "verification code" OR "one-time code")`;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const list = await listGmailMessages(accessToken, query);
    for (const messageStub of list.messages ?? []) {
      const message = await getGmailMessage(accessToken, messageStub.id);
      const internalDate = Number(message.internalDate ?? '0');
      if (Number.isFinite(internalDate) && internalDate < startedAtMs) {
        continue;
      }

      const code = extractClerkOtp(
        `${message.snippet ?? ''}\n${collectMessageText(message.payload)}`
      );
      if (code) return code;
    }

    await new Promise(resolve => setTimeout(resolve, 3_000));
  }

  throw new Error(`Timed out waiting for production signup OTP for ${email}`);
}

async function fetchCloudflareOtpCheck({
  email,
  env,
  startedAtMs,
}: {
  readonly email: string;
  readonly env: CanaryEnv;
  readonly startedAtMs: number;
}): Promise<string | null> {
  const url = env.E2E_PROD_OTP_CHECK_URL;
  const token = env.E2E_PROD_OTP_CHECK_TOKEN;
  if (!url || !token) {
    throw new Error(
      'Cloudflare OTP check is missing E2E_PROD_OTP_CHECK_URL or E2E_PROD_OTP_CHECK_TOKEN'
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, sinceMs: startedAtMs }),
      signal: controller.signal,
    });

    if (response.status === 404 || response.status === 204) {
      return null;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Cloudflare OTP check failed: HTTP ${response.status} ${body}`
      );
    }

    const payload = (await response.json()) as CloudflareOtpCheckResponse;
    const rawCode = payload.otp ?? payload.code;
    if (rawCode) return extractClerkOtp(rawCode) ?? rawCode;
    if (payload.text) return extractClerkOtp(payload.text);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function waitForCloudflareProductionSignupOtp({
  email,
  env,
  startedAtMs,
  timeoutMs = 90_000,
}: {
  readonly email: string;
  readonly env: CanaryEnv;
  readonly startedAtMs: number;
  readonly timeoutMs?: number;
}): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const code = await fetchCloudflareOtpCheck({ email, env, startedAtMs });
    if (code) return code;
    await new Promise(resolve => setTimeout(resolve, 3_000));
  }

  throw new Error(
    `Timed out waiting for Cloudflare-routed production signup OTP for ${email}`
  );
}

export async function waitForProductionSignupOtp({
  email,
  env,
  startedAtMs,
  timeoutMs = 90_000,
}: {
  readonly email: string;
  readonly env: CanaryEnv;
  readonly startedAtMs: number;
  readonly timeoutMs?: number;
}): Promise<string> {
  if (env.E2E_PROD_MAILBOX_PROVIDER === 'cloudflare-email-routing') {
    return waitForCloudflareProductionSignupOtp({
      email,
      env,
      startedAtMs,
      timeoutMs,
    });
  }

  return waitForGmailProductionSignupOtp({
    email,
    env,
    startedAtMs,
    timeoutMs,
  });
}

export async function fillOtpCode(page: Page, code: string) {
  const singleInput = page
    .locator(
      'input[name="code"], input[name="verificationCode"], input[autocomplete="one-time-code"]'
    )
    .first();

  if (await singleInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await singleInput.fill(code);
    return;
  }

  const digitInputs = page.locator('input[inputmode="numeric"]');
  const count = await digitInputs.count();
  if (count >= code.length) {
    for (let index = 0; index < code.length; index++) {
      await digitInputs.nth(index).fill(code[index]!);
    }
    return;
  }

  throw new Error('Could not find a Clerk OTP input to fill');
}

export function isProductionSyntheticSignupEmail(
  email: string,
  baseEmail: string
): boolean {
  const [local, domain] = email.split('@');
  const [baseLocal, baseDomain] = baseEmail.split('@');
  return (
    Boolean(local) &&
    Boolean(domain) &&
    domain === baseDomain &&
    local.startsWith(`${baseLocal}+`)
  );
}

export async function cleanupProductionSyntheticSignup({
  email,
  env,
}: {
  readonly email: string;
  readonly env: CanaryEnv;
}): Promise<void> {
  const baseEmail = env.E2E_PROD_SIGNUP_EMAIL_BASE;
  const secretKey = env.CLERK_SECRET_KEY;
  if (
    !baseEmail ||
    !secretKey ||
    !isProductionSyntheticSignupEmail(email, baseEmail)
  ) {
    throw new Error('Refusing to clean up a non-synthetic production signup');
  }

  void secretKey;
  void email;
}

export async function tagProductionSyntheticSignup({
  email,
  env,
  runId,
}: {
  readonly email: string;
  readonly env: CanaryEnv;
  readonly runId: string;
}): Promise<void> {
  const baseEmail = env.E2E_PROD_SIGNUP_EMAIL_BASE;
  const secretKey = env.CLERK_SECRET_KEY;
  if (
    !baseEmail ||
    !secretKey ||
    !isProductionSyntheticSignupEmail(email, baseEmail)
  ) {
    throw new Error('Refusing to tag a non-synthetic production signup');
  }

  void secretKey;
  void email;
  void runId;
}
