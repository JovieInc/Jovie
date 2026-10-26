/**
 * ASR-023: no music-cliche imagery. Every asset sidecar (<image>.meta.json)
 * under the public asset roots is read as text; a banned subject in any
 * field (kind, subject, tags, alt, prompt) fails. The vision cliche judge
 * covers undeclared imagery and stays advisory until calibrated.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './paths.mjs';

export const BANNED_IMAGERY =
  /\b(?:microphones?|mics?|headphones?|earbuds?|dj(?:s|-?decks?)?|turntables?|vinyl|records? player|guitars?|stage lights?|on stage|concert crowds?|crowd with phones|crowds? holding phones|studio session)\b/iu;
const ROOTS = ['apps/web/public'];

function sidecars(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules')
      sidecars(abs, out);
    else if (entry.name.endsWith('.meta.json')) out.push(abs);
  }
  return out;
}

export function scanSidecar(text) {
  const hit = text.match(BANNED_IMAGERY);
  return hit ? hit[0] : null;
}

export function check(repoRoot = REPO_ROOT) {
  const failures = [];
  for (const root of ROOTS) {
    for (const file of sidecars(join(repoRoot, root))) {
      const bad = scanSidecar(readFileSync(file, 'utf8'));
      if (bad)
        failures.push(
          `ASR-023 ${file.slice(repoRoot.length)} names banned imagery "${bad}"`
        );
    }
  }
  return { failures };
}
