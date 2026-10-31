// Deployed Cloudflare Workers vs source in git (single source of truth).
// A Worker deployed to the account must be declared by a committed
// workers/**/wrangler*.toml|json(c) `name`, or be listed in
// canon/deployed-workers.json as unversioned debt (the list only shrinks).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const DEPLOYED_PATH = 'canon/deployed-workers.json';

const NAME_RE = /^\s*"?name"?\s*[=:]\s*["']([^"']+)["']/m;

/** Worker names declared by committed wrangler configs under workers/ and apps/. */
export function repoWorkerNames(root) {
  const names = new Set();
  const visit = (dir, depth) => {
    if (depth < 0 || !existsSync(join(root, dir))) return;
    for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) visit(rel, depth - 1);
      else if (/^wrangler[\w.-]*\.(toml|jsonc?)$/.test(e.name)) {
        const m = readFileSync(join(root, rel), 'utf8').match(NAME_RE);
        if (m) names.add(m[1]);
      }
    }
  };
  visit('workers', 3);
  visit('apps', 3);
  return names;
}

export function loadDeployedCanon(root) {
  return JSON.parse(readFileSync(join(root, DEPLOYED_PATH), 'utf8'));
}

/**
 * Errors. `deployed` is the live Worker names, or null for the offline check
 * (canon vs repo only).
 */
export function compareWorkers({ deployed, repoNames, canon }) {
  const errors = [];
  const debt = new Map((canon.unversioned ?? []).map(w => [w.name, w]));
  for (const [name, w] of debt) {
    if (repoNames.has(name))
      errors.push(
        `${name}: has source in git now; remove it from ${DEPLOYED_PATH} (the list only shrinks)`
      );
    if (!w.disposition || String(w.disposition).trim().length < 10)
      errors.push(
        `${name}: unversioned entry needs a disposition (import source, or delete the Worker)`
      );
    if (deployed && !deployed.includes(name))
      errors.push(
        `${name}: listed as unversioned but not deployed; remove it from ${DEPLOYED_PATH}`
      );
  }
  for (const name of deployed ?? [])
    if (!repoNames.has(name) && !debt.has(name))
      errors.push(
        `${name}: deployed Worker has no source in git (workers/**/wrangler.toml name) and is not in ${DEPLOYED_PATH}; commit the source or delete the Worker`
      );
  return errors;
}

export async function fetchDeployedWorkers({
  accountId,
  token,
  fetchImpl = fetch,
}) {
  const res = await fetchImpl(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts`,
    {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    }
  );
  const body = await res.json();
  if (!res.ok || !body.success || !Array.isArray(body.result))
    throw new Error(`workers-list-unreadable:${res.status}`); // unreadable is red, never green
  return body.result.map(s => s.id);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.cwd();
  const canon = loadDeployedCanon(root);
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const deployed = process.argv.includes('--live')
    ? await fetchDeployedWorkers({
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? canon.accountId,
        token,
      })
    : null;
  const errors = compareWorkers({
    deployed,
    repoNames: repoWorkerNames(root),
    canon,
  });
  for (const e of errors) console.error(`::error::${e}`);
  console.log(
    `workers-inventory: ${errors.length ? 'FAIL' : 'ok'} (${deployed ? deployed.length + ' deployed' : 'offline'})`
  );
  process.exit(errors.length ? 1 : 0);
}
