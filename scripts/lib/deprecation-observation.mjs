/** Typed check evidence; this producer never owns issue state or Done. */
export const DEPRECATION_OBSERVATION_MARKER =
  '<!-- deprecation-observation:v1 ';
export function deprecationFingerprint(issue) {
  return (
    /\[?(deprecation-[0-9a-f]{12})\]?/.exec(String(issue?.title ?? ''))?.[1] ??
    ''
  );
}
export function parseDeprecationObservation(body) {
  const text = String(body ?? '');
  const start = text.indexOf(DEPRECATION_OBSERVATION_MARKER);
  if (start < 0) return null;
  const end = text.indexOf(' -->', start);
  if (end < 0) return null;
  try {
    const value = JSON.parse(
      text.slice(start + DEPRECATION_OBSERVATION_MARKER.length, end)
    );
    if (
      value.schema !== 'jovie.deprecation-observation/v1' ||
      !/^JOV-[1-9][0-9]*$/.test(value.issue ?? '') ||
      !/^deprecation-[0-9a-f]{12}$/.test(value.fingerprint ?? '') ||
      !['red', 'green'].includes(value.status) ||
      !/^[0-9a-f]{40}$/.test(value.headSha ?? '') ||
      !Number.isFinite(Date.parse(value.observedAt)) ||
      !/^https:\/\/github\.com\/JovieInc\/Jovie\/actions\/runs\/[1-9][0-9]*$/.test(
        value.runUrl ?? ''
      )
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
/** New red evidence outranks older green, independent of delayed comment order. */
export function deprecationCheckGreen(issue) {
  const fingerprint = deprecationFingerprint(issue);
  if (!fingerprint) return null;
  let latest = null;
  for (const comment of issue.commentRecords ?? []) {
    const value = parseDeprecationObservation(comment.body);
    if (
      !value ||
      value.issue !== issue.identifier ||
      value.fingerprint !== fingerprint
    )
      continue;
    if (
      !latest ||
      Date.parse(value.observedAt) > Date.parse(latest.observedAt) ||
      (value.observedAt === latest.observedAt && value.status === 'red')
    )
      latest = value;
  }
  return latest ? latest.status === 'green' : null;
}
export function formatDeprecationObservation(value) {
  const body = `${DEPRECATION_OBSERVATION_MARKER}${JSON.stringify(value)} -->`;
  if (!parseDeprecationObservation(body))
    throw new Error('invalid-deprecation-observation');
  return `${value.status === 'green' ? '<!-- remediation-green -->\n' : ''}${body}\nFingerprint ${value.fingerprint} is ${value.status} in complete successful build ${value.headSha}.\nRun: ${value.runUrl}\nThis records check evidence only; the canonical lifecycle retains deployment, outcome and screen-audit requirements.`;
}
