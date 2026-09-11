import { readFileSync } from 'node:fs';

// async does not yield the event loop across a *Sync call.
export async function loadProfile() {
  return readFileSync('/tmp/profile.json', 'utf8');
}
