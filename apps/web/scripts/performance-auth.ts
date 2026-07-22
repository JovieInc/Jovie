#!/usr/bin/env tsx

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import type { DevTestAuthPersona } from '@/lib/auth/dev-test-auth-types';
import {
  TEST_MODE_COOKIE,
  TEST_PERSONA_COOKIE,
  TEST_USER_ID_COOKIE,
} from '@/lib/auth/test-mode-constants';

export interface PerfAuthCliOptions {
  readonly baseUrl: string;
  readonly help?: boolean;
  readonly json: boolean;
  readonly outPath: string;
  readonly persona: DevTestAuthPersona;
}

interface PerformanceAuthCookie {
  readonly name: string;
  readonly value: string;
  readonly [key: string]: unknown;
}

export interface PerformanceAuthStorageState {
  readonly cookies: readonly PerformanceAuthCookie[];
  readonly origins: readonly unknown[];
}

interface PerformanceAuthPage {
  goto(
    url: string,
    options: {
      readonly timeout: number;
      readonly waitUntil: 'domcontentloaded';
    }
  ): Promise<{ status(): number } | null>;
  evaluate<T>(callback: () => Promise<T>): Promise<T>;
  url(): string;
}

interface PerformanceAuthContext {
  close(): Promise<void>;
  newPage(): Promise<PerformanceAuthPage>;
  storageState(): Promise<PerformanceAuthStorageState>;
}

interface PerformanceAuthBrowser {
  close(): Promise<void>;
  newContext(): Promise<PerformanceAuthContext>;
}

export interface PerformanceAuthRuntime {
  readonly launchBrowser: () => Promise<PerformanceAuthBrowser>;
  readonly persistStorageState: (
    path: string,
    state: PerformanceAuthStorageState
  ) => void | Promise<void>;
}

export interface PerformanceAuthBootstrapResult {
  readonly authStatePath: string;
  readonly baseUrl: string;
  readonly betterAuthUserId: string;
  readonly cookieCount: number;
  readonly persona: DevTestAuthPersona;
  readonly sourcePath: '/api/dev/test-auth/enter';
}

interface BetterAuthSessionResponse {
  readonly status: number;
  readonly userId: string | null;
}

const BETTER_AUTH_SESSION_COOKIE_PATTERN =
  /^(?:__Secure-|__Host-)?better-auth\.session_token(?:_\d+)?$/;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, '..');
const repoRoot = resolve(webRoot, '..', '..');
const defaultPerfAuthPath = resolve(
  repoRoot,
  '.context',
  'perf',
  'auth',
  'user.json'
);
const defaultBaseUrl = process.env.BASE_URL?.trim() || 'http://localhost:3000';

const defaultRuntime: PerformanceAuthRuntime = {
  launchBrowser: () => chromium.launch(),
  persistStorageState: (path, state) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
  },
};

function readRequiredArgument(args: readonly string[], index: number) {
  const value = args[index + 1];
  return value && !value.startsWith('--') ? value : null;
}

export function parsePerfAuthCliArgs(
  args: readonly string[]
): PerfAuthCliOptions {
  let baseUrl = defaultBaseUrl;
  let help = false;
  let json = false;
  let outPath = defaultPerfAuthPath;
  let persona: DevTestAuthPersona = 'creator-ready';

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') {
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--base-url') {
      const value = readRequiredArgument(args, index);
      if (!value) {
        throw new TypeError('Missing value for --base-url');
      }
      baseUrl = new URL(value).toString().replace(/\/$/, '');
      index += 1;
      continue;
    }
    if (arg === '--out') {
      const value = readRequiredArgument(args, index);
      if (!value) {
        throw new TypeError('Missing value for --out');
      }
      outPath = resolve(repoRoot, value);
      index += 1;
      continue;
    }
    if (arg === '--persona') {
      const value = readRequiredArgument(args, index);
      if (
        value !== 'creator' &&
        value !== 'creator-ready' &&
        value !== 'admin'
      ) {
        throw new TypeError('Missing or invalid value for --persona');
      }
      persona = value;
      index += 1;
      continue;
    }

    throw new TypeError(`Unknown argument: ${arg}`);
  }

  return { baseUrl, help, json, outPath, persona };
}

function findCookie(
  state: PerformanceAuthStorageState,
  name: string
): PerformanceAuthCookie | undefined {
  return state.cookies.find(cookie => cookie.name === name);
}

export function validatePerformanceAuthStorageState(
  state: PerformanceAuthStorageState,
  persona: DevTestAuthPersona
) {
  if (state.cookies.length === 0) {
    throw new Error('Better Auth bootstrap produced an empty cookie state.');
  }

  const modeCookie = findCookie(state, TEST_MODE_COOKIE);
  if (modeCookie) {
    throw new Error(
      `Better Auth bootstrap must not persist bypass cookie ${TEST_MODE_COOKIE}.`
    );
  }

  const personaCookie = findCookie(state, TEST_PERSONA_COOKIE);
  if (personaCookie?.value !== persona) {
    throw new Error(
      `Better Auth bootstrap persisted persona ${personaCookie?.value || 'none'} instead of ${persona}.`
    );
  }

  const identity = findCookie(state, TEST_USER_ID_COOKIE)?.value.trim();
  if (!identity) {
    throw new Error(
      `Better Auth bootstrap did not persist ${TEST_USER_ID_COOKIE}.`
    );
  }

  const sessionCookie = state.cookies.find(
    cookie =>
      BETTER_AUTH_SESSION_COOKIE_PATTERN.test(cookie.name) &&
      cookie.value.trim().length > 0
  );
  if (!sessionCookie) {
    throw new Error(
      'Better Auth bootstrap did not persist a signed Better Auth session cookie.'
    );
  }

  return identity;
}

async function readBetterAuthSession(
  page: PerformanceAuthPage
): Promise<BetterAuthSessionResponse> {
  return page.evaluate(async () => {
    const response = await fetch('/api/auth/get-session', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    const body = (await response.json().catch(() => null)) as {
      user?: { id?: unknown };
    } | null;
    return {
      status: response.status,
      userId: typeof body?.user?.id === 'string' ? body.user.id : null,
    };
  });
}

function resolveTargetRoute(persona: DevTestAuthPersona) {
  return persona === 'admin' ? APP_ROUTES.ADMIN : APP_ROUTES.CHAT;
}

export async function bootstrapPerformanceAuth(
  options: PerfAuthCliOptions,
  runtime: PerformanceAuthRuntime = defaultRuntime
): Promise<PerformanceAuthBootstrapResult> {
  const baseUrl = options.baseUrl.replace(/\/$/, '');
  const targetRoute = resolveTargetRoute(options.persona);
  const enterUrl = new URL('/api/dev/test-auth/enter', `${baseUrl}/`);
  enterUrl.searchParams.set('persona', options.persona);
  enterUrl.searchParams.set('redirect', targetRoute);
  enterUrl.searchParams.set('session', 'better-auth');

  const browser = await runtime.launchBrowser();
  let context: PerformanceAuthContext | null = null;

  try {
    context = await browser.newContext();
    const page = await context.newPage();
    const response = await page.goto(enterUrl.toString(), {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    const status = response?.status() ?? null;
    if (status !== null && status >= 400) {
      throw new Error(
        `Better Auth bootstrap entry route returned HTTP ${status}.`
      );
    }

    const landedUrl = new URL(page.url());
    if (landedUrl.pathname !== targetRoute) {
      throw new Error(
        `Better Auth bootstrap landed on ${landedUrl.pathname || page.url()} instead of ${targetRoute}.`
      );
    }

    const state = await context.storageState();
    const betterAuthUserId = validatePerformanceAuthStorageState(
      state,
      options.persona
    );
    const session = await readBetterAuthSession(page);
    if (session.status >= 400 || !session.userId) {
      throw new Error(
        `Better Auth session verification failed (HTTP ${session.status}).`
      );
    }
    if (session.userId !== betterAuthUserId) {
      throw new Error(
        `Better Auth session resolved ${session.userId} instead of ${betterAuthUserId}.`
      );
    }
    await runtime.persistStorageState(options.outPath, state);

    return {
      authStatePath: options.outPath,
      baseUrl,
      betterAuthUserId,
      cookieCount: state.cookies.length,
      persona: options.persona,
      sourcePath: '/api/dev/test-auth/enter',
    };
  } finally {
    await context?.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

function usage() {
  return [
    'Usage: pnpm --filter @jovie/web run perf:auth -- [options]',
    '',
    'Options:',
    '  --base-url <url>                 Running local Jovie origin',
    '  --out <path>                     Playwright storage-state output',
    '  --persona <creator|creator-ready|admin>',
    '  --json                           Emit machine-readable result',
    '  --help                           Show this help',
  ].join('\n');
}

async function main() {
  const options = parsePerfAuthCliArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const result = await bootstrapPerformanceAuth(options);
  const serialized = JSON.stringify(result, null, 2);
  process.stdout.write(`${serialized}\n`);
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (entryPath === fileURLToPath(import.meta.url)) {
  void main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
