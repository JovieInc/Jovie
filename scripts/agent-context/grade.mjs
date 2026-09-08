import { isDeepStrictEqual } from 'node:util';

export function grade(cases, responses) {
  if (
    !Array.isArray(cases) ||
    cases.length === 0 ||
    !Array.isArray(responses)
  ) {
    return {
      ok: false,
      errors: ['nonempty cases and response arrays required'],
    };
  }
  const errors = [];
  const expectedIds = new Set(cases.map(c => c.id));
  if (expectedIds.size !== cases.length) errors.push('duplicate case IDs');
  const seen = new Set();
  for (const response of responses) {
    if (!response || !expectedIds.has(response.id)) {
      errors.push('unknown response ID');
      continue;
    }
    if (!isDeepStrictEqual(Object.keys(response).sort(), ['decision', 'id']))
      errors.push(`unexpected response fields: ${response.id}`);
    if (seen.has(response.id))
      errors.push(`duplicate response: ${response.id}`);
    seen.add(response.id);
    const expected = cases.find(c => c.id === response.id).expected;
    if (!isDeepStrictEqual(response.decision, expected))
      errors.push(`wrong decision: ${response.id}`);
  }
  for (const id of expectedIds)
    if (!seen.has(id)) errors.push(`missing response: ${id}`);
  return { ok: errors.length === 0, total: cases.length, errors };
}
