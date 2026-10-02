import type { FullConfig } from '@playwright/test';
import {
  assertWorktreeIdentity,
  isLoopbackOrigin,
} from '../lib/observability/worktree-identity.mjs';
import { collectWorktreeIdentity } from './worktree-identity.mjs';

/** Only configurations that launch a local dev server opt into this boundary. */
export function worktreeMetadata(
  baseURL: string,
  managed: boolean,
  cwd: string
) {
  if (!managed || !isLoopbackOrigin(baseURL)) return {};
  const url = new URL(baseURL);
  const { id, head, port } = collectWorktreeIdentity(
    cwd,
    url.port || (url.protocol === 'https:' ? '443' : '80')
  );
  return { worktree: { id, head, port, origin: url.origin } };
}

export async function verifyWorktreeApp(
  config: FullConfig,
  request: typeof fetch = fetch
) {
  const expected = config.metadata?.worktree;
  if (!expected) return;
  if (!isLoopbackOrigin(expected.origin))
    throw new Error('Worktree verification requires a loopback app');
  const response = await request(`${expected.origin}/api/health/build-info`, {
    signal: AbortSignal.timeout(30_000),
    redirect: 'error',
    cache: 'no-store',
  });
  if (response.status !== 200)
    throw new Error(`Worktree build-info returned ${response.status}`);
  const body: unknown = await response.json();
  const actual =
    body && typeof body === 'object' && 'worktree' in body
      ? body.worktree
      : null;
  const observed = assertWorktreeIdentity(expected, actual);
  config.metadata.worktree = { ...expected, ...observed };
  console.log(
    `[worktree] verified ${observed.id} ${observed.head} boot=${observed.boot} port=${observed.port}`
  );
}

export default verifyWorktreeApp;
