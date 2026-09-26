// Superseded main caches: allowlisted families only; the newest per stem
// stays. Playwright is excluded (two live hashFiles variants share a stem).
import { execFileSync } from 'node:child_process';

const H = '[0-9a-f]+';
const FAMILIES = [
  `(\\w+-next-build-web-v1)-${H}-\\d{8}`,
  `(jovie-web-tsbuildinfo-v2-\\w+)-${H}-(h\\d{10}|${H})`,
  `(pnpm-node-modules-v2-\\w+-\\w+)-${H}-${H}`,
  `(jovie-production-next-cache-v1-\\w+)-${H}`,
  `(\\w+-turbo)-${H}`,
  '(symphony-selector-v1-\\w+)-.+',
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
      if (key.startsWith('pnpm-node-modules-v1-')) return true;
      const stem = FAMILIES.map(re => key.match(re)?.[1]).find(Boolean);
      if (!stem) return false;
      if (seen.has(stem)) return true;
      seen.add(stem);
      return false;
    });
}

if (process.argv[1]?.endsWith('actions-cache-supersede.mjs')) {
  const apply = process.env.APPLY === 'true';
  const api = `repos/${process.env.GITHUB_REPOSITORY}/actions/caches`;
  const gh = a =>
    execFileSync('gh', ['api', ...a], { encoding: 'utf8', maxBuffer: 1e8 });
  const q = `${api}?ref=refs/heads/main&per_page=100`;
  const out = gh(['--paginate', '--jq', '.actions_caches[] | tojson', q]);
  const caches = out
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l));
  for (const { id, key } of planSuperseded(caches)) {
    console.log(`${apply ? '' : 'dry-run '}delete ${id} ${key}`);
    try {
      if (apply) gh(['-X', 'DELETE', `${api}/${id}`]);
    } catch (e) {
      console.log(`::warning::${id}: ${e.message}`);
    }
  }
}
