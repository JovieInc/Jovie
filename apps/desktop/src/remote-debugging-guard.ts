/**
 * Remote-debugging (Chrome DevTools Protocol) guard for the Electron shell.
 *
 * Electron honours `--remote-debugging-port` / `--remote-debugging-pipe`
 * whenever they appear on the process command line, regardless of app code.
 * A packaged shell (production/staging/local `.app`) can be launched by ANY
 * local process, so if such a launcher passes a CDP switch the renderer's
 * cookies (including the Clerk session) and DOM become readable/injectable by
 * every process running as the same user — a full session-hijack surface.
 *
 * Rule:
 *   - Packaged builds NEVER expose CDP. If a CDP switch is present we refuse to
 *     continue and exit, tearing the app (and the exposed port) down.
 *   - Unpackaged source runs (`pnpm dev`, `launch-electron.mjs`) may attach CDP
 *     only when the developer explicitly opts in with `JOVIE_DEV=1`.
 *
 * This mirrors the opt-in gating already enforced in
 * `apps/desktop/scripts/launch-electron.mjs`, and closes the hole where the
 * packaged binary itself is started with the flag by an external launcher.
 */

export interface RemoteDebuggingGuardInput {
  /** `app.isPackaged` — true for built `.app`/`.exe`, false for source runs. */
  readonly isPackaged: boolean;
  /** Whether `--remote-debugging-port` is present on the command line. */
  readonly hasRemoteDebuggingPort: boolean;
  /** Whether `--remote-debugging-pipe` is present on the command line. */
  readonly hasRemoteDebuggingPipe: boolean;
  /** Value of `process.env.JOVIE_DEV` (developer opt-in for source runs). */
  readonly jovieDev: string | undefined;
}

export interface RemoteDebuggingGuardDecision {
  readonly blocked: boolean;
  /** Which switch triggered the block, or null when not blocked. */
  readonly reason: 'remote-debugging-port' | 'remote-debugging-pipe' | null;
}

export function evaluateRemoteDebuggingGuard(
  input: RemoteDebuggingGuardInput
): RemoteDebuggingGuardDecision {
  const requestedSwitch = input.hasRemoteDebuggingPort
    ? 'remote-debugging-port'
    : input.hasRemoteDebuggingPipe
      ? 'remote-debugging-pipe'
      : null;

  if (requestedSwitch === null) {
    return { blocked: false, reason: null };
  }

  // Source runs may keep CDP when the developer explicitly opts in.
  // Packaged builds are never allowed to expose it, even with JOVIE_DEV,
  // because the packaged binary can be started by any local process.
  if (!input.isPackaged && input.jovieDev === '1') {
    return { blocked: false, reason: null };
  }

  return { blocked: true, reason: requestedSwitch };
}
