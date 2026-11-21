// Summer-visible Linear labels for security-advisory intake.
// Gem's `devin` lane is not the routing label; Summer owns admission.

/** @type {readonly string[]} */
export const SUMMER_SECURITY_LABELS = ['security', 'Bug', 'area:security'];

/**
 * Resolve Summer security routing labels. Fail closed if any required label
 * is missing so advisories never land without Summer-visible ownership.
 * @param {(name: string, apiKey: string) => Promise<string | null>} resolveLabel
 * @param {string} [apiKey]
 * @returns {Promise<string[]>}
 */
export async function resolveSummerSecurityLabelIds(
  resolveLabel,
  apiKey = process.env.LINEAR_API_KEY
) {
  const ids = [];
  for (const name of SUMMER_SECURITY_LABELS) {
    const id = await resolveLabel(name, apiKey);
    if (!id) throw new Error(`Linear label "${name}" not found`);
    ids.push(id);
  }
  return ids;
}
