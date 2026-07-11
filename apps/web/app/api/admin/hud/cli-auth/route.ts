import 'server-only';

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { requireAdminHudApiAccess } from '@/lib/hud/require-admin-hud-api';

export const runtime = 'nodejs';
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
type Provider = 'grok' | 'codex' | 'claude';
const PROVIDERS = new Set<Provider>(['grok', 'codex', 'claude']);

function isLocalRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname;
  return (
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  );
}

function statusFor(provider: Provider): {
  provider: Provider;
  available: boolean;
  detail: string;
} {
  const home = homedir();
  if (provider === 'grok')
    return {
      provider,
      available: existsSync(join(home, '.grok', 'auth.json')),
      detail: 'OAuth is available from the local launcher.',
    };
  if (provider === 'codex')
    return {
      provider,
      available: existsSync(join(home, '.codex', 'auth.json')),
      detail: 'Local credentials detected.',
    };
  return {
    provider,
    available: existsSync(join(home, '.claude', '.credentials.json')),
    detail: 'Local credentials detected.',
  };
}

function launch(provider: Provider): Promise<void> {
  const command =
    provider === 'grok' ? 'grok' : provider === 'codex' ? 'codex' : 'claude';
  const args =
    provider === 'grok'
      ? ['--oauth']
      : provider === 'codex'
        ? ['login']
        : ['auth', 'login'];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdminHudApiAccess();
  if (denied) return denied;
  if (!isLocalRequest(request))
    return NextResponse.json(
      { error: 'Local-only action' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  return NextResponse.json(
    { providers: (['grok', 'codex', 'claude'] as const).map(statusFor) },
    { headers: NO_STORE_HEADERS }
  );
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdminHudApiAccess();
  if (denied) return denied;
  if (!isLocalRequest(request))
    return NextResponse.json(
      { error: 'Local-only action' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  const body = (await request.json()) as { provider?: unknown };
  const provider = body.provider;
  if (typeof provider !== 'string' || !PROVIDERS.has(provider as Provider)) {
    return NextResponse.json(
      { error: 'Unknown provider' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
  try {
    await launch(provider as Provider);
    return NextResponse.json(
      { ok: true, message: 'The local sign-in window is opening.' },
      { headers: NO_STORE_HEADERS }
    );
  } catch {
    return NextResponse.json(
      {
        error:
          'The local sign-in tool is not installed or could not be started.',
      },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
