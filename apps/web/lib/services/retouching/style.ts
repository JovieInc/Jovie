/**
 * White Space retouch style — prompt + versioning.
 *
 * The canonical style document lives at styles/white-space.md (referenced by
 * SKILL_REGISTRY.retouch.promptPath). Serverless bundling cannot reliably
 * trace runtime fs reads of markdown (see next.config.js file-tracing notes),
 * so the prompt is embedded here as a constant. A unit test asserts this
 * constant stays byte-identical to the markdown file, so the two cannot
 * drift silently.
 */

import { createHash } from 'node:crypto';
import { WHITE_SPACE_STYLE_PROMPT } from './style-prompt';

export { WHITE_SPACE_STYLE_PROMPT } from './style-prompt';

export const WHITE_SPACE_STYLE_ID = 'white-space' as const;

export type RetouchStyleId = typeof WHITE_SPACE_STYLE_ID;

let cachedStyleVersion: string | null = null;

/**
 * SHA-256 of the style prompt. Recorded on every retouch_jobs row so output
 * quality can be correlated with prompt revisions post-hoc.
 */
export function getRetouchStyleVersion(): string {
  if (!cachedStyleVersion) {
    cachedStyleVersion = createHash('sha256')
      .update(WHITE_SPACE_STYLE_PROMPT, 'utf8')
      .digest('hex');
  }
  return cachedStyleVersion;
}

/**
 * Builds the full editing instruction sent alongside the source image.
 * Optional per-image direction from the artist is appended after the style
 * document so the non-negotiable guardrails always lead.
 */
const GENERATION_PRESERVE_CLAUSE = `## Preserve Clause For This Generation

Keep face identity unchanged unless the artist explicitly asked to change it. Name what stays: face structure, age, skin tone, hair, and distinctive features. Default: one sequential action (retouch, enhance, extend, or replace_bg), subtle intensity, natural skin texture.`;

export function buildRetouchPrompt(input: {
  readonly instructions?: string | null;
}): string {
  const base = `Retouch the attached photo following this style guide. Return the edited image.\n\n${WHITE_SPACE_STYLE_PROMPT}\n${GENERATION_PRESERVE_CLAUSE}`;
  const extra = input.instructions?.trim();
  if (!extra) {
    return base;
  }
  return `${base}\n\n## Artist Direction For This Image\n\n${extra}\n\nApply this direction only where it does not conflict with the Non-Negotiable Guardrails and Preserve Clause above.`;
}
