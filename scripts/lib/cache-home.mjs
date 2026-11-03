import { homedir } from 'node:os';
import path from 'node:path';

/** XDG paths must be absolute; invalid or empty values use the home default. */
export function cacheHome(env = process.env) {
  const configured = env.XDG_CACHE_HOME;
  return configured && path.isAbsolute(configured)
    ? configured
    : path.join(homedir(), '.cache');
}
