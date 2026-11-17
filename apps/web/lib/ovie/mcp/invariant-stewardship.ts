import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import stewardshipAudit from '../generated/invariant-stewardship.current-week.json';
import { projectStewardshipEvidence } from '../invariant-stewardship.js';

/** Read the authority in this build; absence never falls back to snapshot claims. */
export async function readCanonicalStewardshipSource(): Promise<string | null> {
  for (const relative of [
    'canon/invariants.jsonl',
    '../../canon/invariants.jsonl',
    'runtime-data/canon/invariants.jsonl',
  ]) {
    try {
      return await readFile(
        /* turbopackIgnore: true */ resolve(
          /* turbopackIgnore: true */ process.cwd(),
          relative
        ),
        'utf8'
      );
    } catch {
      // Try the app-root/build copy of the same canonical source.
    }
  }
  return null;
}

export async function getInvariantStewardship() {
  return projectStewardshipEvidence(
    stewardshipAudit,
    await readCanonicalStewardshipSource()
  );
}
