import { readFileSync } from 'node:fs';

// Moving the sync call out of generateMetadata into a shared helper
// is zero escape for the thread-blocking class.
export function getProfile() {
  return readFileSync('/tmp/profile.json', 'utf8');
}
