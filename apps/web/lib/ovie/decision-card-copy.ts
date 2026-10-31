const ACTS =
  /^(?:ship|apply|approve|accept|merge|send|launch|publish|go|proceed|deploy|enable|turn on|run)\b/iu;
const HOLDS =
  /^(?:do nothing|nothing|no action|reject|skip|hold|keep (?:it|things) as is|wait|don't|do not|pause|cancel)\b/iu;

/** Whether the default text says the opposite of what the deadline records. */
export function defaultContradictsDecision(
  summary: string | null,
  decision: 'approve' | 'reject' | 'none' | null
): boolean {
  if (!summary) return false;
  const text = summary.trim();
  const effective = decision ?? 'reject';
  if (effective === 'reject') return ACTS.test(text);
  if (effective === 'approve') return HOLDS.test(text);
  return false;
}
