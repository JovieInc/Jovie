import { existsSync } from 'node:fs';

// existsSync inside request-path function bodies is gated (gray, still blocking).
export function hasLocalConfig() {
  return existsSync('/tmp/jovie-config.json');
}
