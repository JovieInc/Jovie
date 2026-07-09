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

export const WHITE_SPACE_STYLE_ID = 'white-space' as const;

export type RetouchStyleId = typeof WHITE_SPACE_STYLE_ID;

/** Must match lib/services/retouching/styles/white-space.md exactly. */
export const WHITE_SPACE_STYLE_PROMPT = `# White Space Retouch Style

Use this style for Jovie AI retouching when the user asks for the White Space look: cinematic editorial polish, soft natural contrast, clean skin tone handling, and restrained Kodak Portra-inspired color.

## Non-Negotiable Guardrails

- Preserve the person's identity, face structure, age appearance, skin tone, hair, body shape, and distinctive features.
- Do not change protected or sensitive attributes.
- Do not add or remove people, tattoos, scars, logos, jewelry, wardrobe items, or identifying marks.
- Do not sexualize the subject or make the image less safe for work.
- Do not fabricate text, signatures, documents, credentials, or brand marks.
- If the input is too low quality or ambiguous to preserve identity confidently, return a safe refusal instead of guessing.

## Visual Direction

- Keep the image photorealistic and suitable for an artist press kit, profile, or campaign asset.
- Use gentle filmic contrast, soft highlight rolloff, natural grain, and balanced warmth.
- Clean distracting artifacts, dust, compression noise, and minor lighting issues without making the subject look synthetic.
- Keep backgrounds simple and believable. Do not replace the setting unless explicitly requested and safe.
- Maintain composition, crop, camera angle, and wardrobe unless the user explicitly requests a safe adjustment.

## Output Standard

The result should feel polished but still honest: the same person, same moment, cleaner presentation.
`;

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
export function buildRetouchPrompt(input: {
  readonly instructions?: string | null;
}): string {
  const base = `Retouch the attached photo following this style guide. Return the edited image.\n\n${WHITE_SPACE_STYLE_PROMPT}`;
  const extra = input.instructions?.trim();
  if (!extra) {
    return base;
  }
  return `${base}\n## Artist Direction For This Image\n\n${extra}\n\nApply this direction only where it does not conflict with the Non-Negotiable Guardrails above.`;
}
