import { isAbsolute } from 'node:path';

/** Test profiles may never redirect an installed application's session. */
export function sourceHostProfile(
  packaged: boolean,
  channel: string,
  env: NodeJS.ProcessEnv
): string | null {
  const profile = env.JOVIE_DEV_USER_DATA_DIR;
  if (packaged || channel !== 'local' || env.JOVIE_DEV !== '1' || !profile)
    return null;
  if (!isAbsolute(profile))
    throw new Error('Source-host profile must be absolute');
  return profile;
}
