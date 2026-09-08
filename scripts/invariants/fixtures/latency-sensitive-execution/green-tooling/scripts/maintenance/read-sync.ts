import { readFileSync, writeFileSync } from 'node:fs';

// Tooling-only sync under scripts/ is out of the runtime request-path gate.
export function dumpJournal(path: string, body: string): string {
  writeFileSync(path, body);
  return readFileSync(path, 'utf8');
}
