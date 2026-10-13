// Superseded main caches: allowlisted families only; the newest per stem
// stays. Playwright is excluded (two live hashFiles variants share a stem).
// A planning stage of scripts/lib/actions-cache-gc.mjs, the one cache
// eviction controller (Actions Cache GC, on every main push).

const H = '[0-9a-f]+';
const FAMILIES = [
  `(\\w+-next-build-web-v1)-${H}-\\d{8}(?:\\d{2})?`,
  `(jovie-web-tsbuildinfo-v2-\\w+)-${H}-(h\\d{10}|${H})`,
  `(pnpm-node-modules-v4-\\w+-\\w+)-${H}-${H}`,
  `(jovie-production-next-cache-v1-\\w+)-${H}`,
  `(\\w+-turbo)-${H}`,
  `(linear-sync-github-v1)-${H}`,
  `(flaky-run-evidence)-${H}`,
].map(s => new RegExp(`^${s}$`));

export function planSuperseded(caches) {
  const seen = new Set();
  return caches
    .filter(c => c.ref === 'refs/heads/main')
    .sort(
      (a, b) =>
        Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id
    )
    .filter(({ key }) => {
      if (/^pnpm-node-modules-v[123]-/.test(key)) return true;
      const stem = FAMILIES.map(re => key.match(re)?.[1]).find(Boolean);
      if (!stem) return false;
      if (seen.has(stem)) return true;
      seen.add(stem);
      return false;
    });
}
