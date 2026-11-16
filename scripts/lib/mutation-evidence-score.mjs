/**
 * A timeout, skipped mutant or unknown disposition is incomplete evidence,
 * never a kill. Keep those mutants in the denominator and withhold the score
 * rather than reporting a stronger score from only the completed subset.
 * CompileError alone proves the generated mutant is invalid and is excluded.
 * @param {{ status: string }[]} mutants
 */
export function scoreMutants(mutants) {
  /** @type {Record<string, number>} */
  const counts = Object.create(null);
  for (const mutant of mutants) {
    counts[mutant.status] = (counts[mutant.status] ?? 0) + 1;
  }
  const detected = counts.Killed ?? 0;
  const undetected = (counts.Survived ?? 0) + (counts.NoCoverage ?? 0);
  const invalid = counts.CompileError ?? 0;
  const unknown = mutants.length - detected - undetected - invalid;
  const valid = detected + undetected + unknown;
  const complete = valid > 0 && unknown === 0;
  return {
    detected,
    undetected,
    valid,
    invalid,
    unknown,
    complete,
    counts,
    score: complete ? Math.round((detected / valid) * 1000) / 10 : null,
  };
}
