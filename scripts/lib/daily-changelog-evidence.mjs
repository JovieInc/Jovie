/** The exact verified release policy can explicitly waive auth smoke. */
export function hasRequiredAuthSmoke(marker) {
  const risk = marker?.releasePolicy;
  return (
    marker?.authSmoke === 'passed' ||
    (marker?.authSmoke === 'not-required' &&
      risk?.schema === 'jovie.release-risk-receipt/v1' &&
      risk?.originalClassification?.requires_smoke === false &&
      risk?.ovie?.rangeRisk?.candidateSha === marker?.sha &&
      risk?.ovie?.rangeRisk?.unknown === false &&
      risk?.ovie?.rangeRisk?.requiresSmoke === false)
  );
}
