// High-touch ranking for the test-quality loop: tier weight (revenue, auth,
// golden path, traffic) plus git churn. Pure; the CLI feeds it git output.

/**
 * @param {string} file path relative to apps/web
 * @param {{ tiers: { name: string, weight: number, prefixes: string[] }[] }} config
 */
export function tierFor(file, config) {
  for (const tier of config.tiers) {
    if (tier.prefixes.some(prefix => file.startsWith(prefix))) return tier;
  }
  return { name: 'unranked', weight: 0, prefixes: [] };
}

/**
 * @param {string} file
 * @param {number} commits commits touching the file in the churn window
 * @param {{ tiers: any[], churnWeight: number, churnCap: number }} config
 */
export function touchScore(file, commits, config) {
  const tier = tierFor(file, config);
  return tier.weight + config.churnWeight * Math.min(commits, config.churnCap);
}

/**
 * @param {string[]} files
 * @param {Map<string, number>|Record<string, number>} churn
 * @param {any} config
 * @returns {{ file: string, tier: string, commits: number, touch: number }[]}
 */
export function rankSurfaces(files, churn, config) {
  const get =
    churn instanceof Map ? f => churn.get(f) ?? 0 : f => churn[f] ?? 0;
  return files
    .map(file => {
      const commits = get(file);
      return {
        file,
        tier: tierFor(file, config).name,
        commits,
        touch: touchScore(file, commits, config),
      };
    })
    .sort((a, b) => b.touch - a.touch || a.file.localeCompare(b.file));
}

/** Parse `git log --name-only --pretty=format:` output into commit counts. */
export function parseChurn(logText, webRoot = 'apps/web/') {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const line of logText.split('\n')) {
    if (!line.startsWith(webRoot)) continue;
    const rel = line.slice(webRoot.length);
    counts[rel] = (counts[rel] ?? 0) + 1;
  }
  return counts;
}
