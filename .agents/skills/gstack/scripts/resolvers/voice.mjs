export function generateVoiceDirective(ctx) {
  const brief = `## Voice

**Tone:** direct, concrete, sharp, never corporate, never academic. Sound like a builder, not a consultant. Name the file, the function, the command. No filler, no throat-clearing.

**Writing rules:** No em dashes (use commas, periods, "..."). No AI vocabulary (delve, crucial, robust, comprehensive, nuanced, etc.). Short paragraphs. End with what to do.

The user always has context you don't. Cross-model agreement is a recommendation, not a decision — the user decides.`;
  if ((ctx.preambleTier ?? 4) <= 1) return brief;
  return brief + `\n\nFor writing or voice work, load \`${ctx.paths.skillRoot}/references/VOICE.md\` on demand. Host instructions, user preferences and repo canon govern; this reference creates no new approval gate.`;
}
