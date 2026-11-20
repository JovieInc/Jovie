#!/usr/bin/env node
/**
 * Presence-only secret check for agents (JOV-7998). Prints `NAME set|unset`.
 * It never reads a value into output: environment variables are tested for
 * non-empty, Doppler is queried with --only-names.
 *
 *   node scripts/secrets/secret-present.mjs NAME [NAME...]
 *   node scripts/secrets/secret-present.mjs --doppler jovie-web/dev NAME ...
 */
import { execFileSync } from 'node:child_process';

export function presenceFromEnv(names, env = process.env) {
  return names.map(name => ({
    name,
    set: typeof env[name] === 'string' && env[name].length > 0,
  }));
}

export function presenceFromNames(names, present) {
  const have = new Set(present);
  return names.map(name => ({ name, set: have.has(name) }));
}

export function formatPresence(rows) {
  return rows.map(r => `${r.name} ${r.set ? 'set' : 'unset'}`).join('\n');
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  const args = process.argv.slice(2);
  const dIdx = args.indexOf('--doppler');
  let rows;
  if (dIdx > -1) {
    const [project, config] = args[dIdx + 1].split('/');
    const names = args.filter((_, i) => i !== dIdx && i !== dIdx + 1);
    const raw = execFileSync(
      'doppler',
      ['secrets', '--only-names', '--json', '-p', project, '-c', config],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    );
    rows = presenceFromNames(names, Object.keys(JSON.parse(raw)));
  } else {
    rows = presenceFromEnv(args);
  }
  console.log(formatPresence(rows));
  process.exit(rows.every(r => r.set) ? 0 : 1);
}
