import { readFileSync as loadSync } from 'node:fs';

export function readViaAlias() {
  return loadSync('/tmp/profile.json', 'utf8');
}
