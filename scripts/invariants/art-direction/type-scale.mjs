/**
 * ASR-025: marketing type stays on a restrained Linear-precision scale.
 * No heading or display text above CAP_PX (80px). The single claim statement
 * (jov.ie/you) may exceed it only through type-scale.exceptions.json, with a reason.
 * Reads font-size declarations (px, rem, em, clamp max) and Tailwind text-Nxl
 * and text-[..] utilities in marketing sources.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MARKETING_SOURCE_ROOTS,
  REPO_ROOT,
  relPath,
  stripComments,
  walkFiles,
} from './paths.mjs';

export const CAP_PX = 80;
export const EXCEPTIONS =
  'scripts/invariants/art-direction/type-scale.exceptions.json';
const TAILWIND_STEPS = { '7xl': 72, '8xl': 96, '9xl': 128 };

function maxPx(value) {
  let max = 0;
  for (const m of value.matchAll(/(-?\d*\.?\d+)(px|rem|em)\b/gu)) {
    const px = Number(m[1]) * (m[2] === 'px' ? 1 : 16);
    if (px > max) max = px;
  }
  return max;
}

export function scanTypeScale(text, file = '') {
  const hits = [];
  const lines = stripComments(text).split('\n');
  lines.forEach((line, index) => {
    for (const m of line.matchAll(/font-size\s*:\s*([^;}]+)/gu)) {
      const px = maxPx(m[1]);
      if (px > CAP_PX)
        hits.push({ file, line: index + 1, px, text: m[0].trim() });
    }
    for (const m of line.matchAll(/(?<![\w-])text-(7xl|8xl|9xl)(?![\w-])/gu)) {
      if (TAILWIND_STEPS[m[1]] > CAP_PX)
        hits.push({
          file,
          line: index + 1,
          px: TAILWIND_STEPS[m[1]],
          text: m[0],
        });
    }
    for (const m of line.matchAll(/(?<![\w-])text-\[([^\]]+)\]/gu)) {
      const px = maxPx(m[1]);
      if (px > CAP_PX) hits.push({ file, line: index + 1, px, text: m[0] });
    }
  });
  return hits;
}

export function check(repoRoot = REPO_ROOT) {
  let exceptions = [];
  try {
    exceptions = JSON.parse(
      readFileSync(join(repoRoot, EXCEPTIONS), 'utf8')
    ).exceptions;
  } catch {}
  const failures = [];
  for (const abs of walkFiles(repoRoot, MARKETING_SOURCE_ROOTS)) {
    const rel = relPath(repoRoot, abs);
    for (const hit of scanTypeScale(readFileSync(abs, 'utf8'), rel)) {
      const allowed = exceptions.some(
        e => e.file === rel && hit.text.includes(e.match) && e.reason
      );
      if (!allowed)
        failures.push(
          `ASR-025 ${rel}:${hit.line} ${hit.text} is ${hit.px}px, above the ${CAP_PX}px marketing cap`
        );
    }
  }
  return { failures };
}
