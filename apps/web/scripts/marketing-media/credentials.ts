/**
 * Runtime secret lookup for marketing media adapters (JOV-7250).
 *
 * Keys never live in code or in plain env files. A key is read from Doppler
 * at call time: from the environment only when `doppler run` injected it
 * (DOPPLER_PROJECT is set), otherwise through `doppler secrets get --plain`.
 * A missing key is a normal outcome, not an error, so callers can no-op with
 * a `credentials-unavailable` result. The value is never logged or returned
 * in a reason string.
 */

import { spawnSync } from 'node:child_process';

export const MARKETING_MEDIA_DOPPLER_SCOPE = {
  project: 'jovie-web',
  config: 'dev',
} as const;

export type RuntimeSecret =
  | {
      readonly ok: true;
      readonly value: string;
      readonly source: 'doppler-run' | 'doppler-cli';
    }
  | { readonly ok: false; readonly reason: string };

export type SpawnSyncLike = (
  command: string,
  args: readonly string[],
  options: { readonly encoding: 'utf8'; readonly timeout: number }
) => {
  readonly status: number | null;
  readonly stdout: string | Buffer | null;
  readonly error?: Error;
};

export interface ReadDopplerSecretOptions {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly spawnImpl?: SpawnSyncLike;
  readonly project?: string;
  readonly config?: string;
}

export function readDopplerSecret(
  name: string,
  options: ReadDopplerSecretOptions = {}
): RuntimeSecret {
  const env = options.env ?? process.env;
  const injected = env[name]?.trim();
  if (injected && env.DOPPLER_PROJECT) {
    return { ok: true, value: injected, source: 'doppler-run' };
  }

  const project = options.project ?? MARKETING_MEDIA_DOPPLER_SCOPE.project;
  const config = options.config ?? MARKETING_MEDIA_DOPPLER_SCOPE.config;
  const spawnImpl = options.spawnImpl ?? (spawnSync as SpawnSyncLike);
  const result = spawnImpl(
    'doppler',
    [
      'secrets',
      'get',
      name,
      '--plain',
      '--project',
      project,
      '--config',
      config,
    ],
    { encoding: 'utf8', timeout: 15_000 }
  );
  if (result.error) {
    return {
      ok: false,
      reason: `doppler CLI unavailable (${result.error.message})`,
    };
  }
  const value = String(result.stdout ?? '').trim();
  if (result.status !== 0 || !value) {
    return {
      ok: false,
      reason: `${name} is not set in Doppler ${project}/${config}`,
    };
  }
  return { ok: true, value, source: 'doppler-cli' };
}
