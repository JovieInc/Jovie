#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  COMPANY_DOMAINS,
  parseRdap,
  parseWhois,
} from './lib/domain-expiry.mjs';
import { upsertLinearIssueByTitleFingerprint } from './lib/linear-issue-intake.mjs';
import {
  EXHAUSTED_LABEL,
  readVercelReadonlyToken,
  runRemediationSweep,
  SUMMER_CONFIG_REPO,
  SUMMER_HEALTH_URL,
  VERCEL_PROJECTS,
  VERCEL_TEAM_ID,
} from './lib/remediation-sweep.mjs';

const execFileAsync = promisify(execFile);

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

async function gh(args) {
  const { stdout } = await execFileAsync('gh', args, {
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout;
}

function reviewerName(review) {
  return (
    review?.login ??
    review?.slug ??
    review?.name ??
    review?.author?.login ??
    null
  );
}

export function normalizePull(node) {
  const reviewers = [...(node.reviewRequests ?? []), ...(node.reviews ?? [])]
    .map(reviewerName)
    .filter(name => typeof name === 'string' && name.length > 0);
  return {
    number: node.number,
    isDraft: node.isDraft === true,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    url: node.url,
    labels: (node.labels ?? [])
      .map(label => label?.name)
      .filter(name => typeof name === 'string'),
    reviewRequestCount: node.reviewRequests?.length ?? 0,
    reviewCount: node.reviews?.length ?? 0,
    reviewers: [...new Set(reviewers)].sort(),
  };
}

export async function loadOpenPullRequests(
  repo = process.env.GITHUB_REPOSITORY
) {
  const [owner, name] = String(repo || '').split('/');
  if (!owner || !name) throw new Error('GITHUB_REPOSITORY must be owner/name');
  const nodes = JSON.parse(
    await gh([
      'pr',
      'list',
      '--repo',
      `${owner}/${name}`,
      '--state',
      'open',
      '--limit',
      '500',
      '--json',
      'number,isDraft,createdAt,updatedAt,url,labels,reviewRequests,reviews',
    ])
  );
  if (nodes.length >= 500) {
    throw new Error('open pull request list hit the 500 cap');
  }
  const pulls = nodes.map(normalizePull);
  for (const pull of pulls) {
    if (!pull.labels.some(label => label.toLowerCase() === EXHAUSTED_LABEL))
      continue;
    const stdout = await gh([
      'api',
      '--paginate',
      `repos/${owner}/${name}/issues/${pull.number}/events?per_page=100`,
      '--jq',
      `.[] | select(.event=="labeled" and .label.name=="${EXHAUSTED_LABEL}") | .created_at`,
    ]);
    pull.exhaustedSince =
      stdout
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .at(-1) ?? null;
  }
  return pulls;
}

export async function loadSummerConfigPullRequests(repo = SUMMER_CONFIG_REPO) {
  const nodes = JSON.parse(
    await gh([
      'pr',
      'list',
      '--repo',
      repo,
      '--state',
      'open',
      '--limit',
      '500',
      '--json',
      'number,isDraft,url,headRefOid,autoMergeRequest,statusCheckRollup',
    ])
  );
  if (nodes.length >= 500) {
    throw new Error(`${repo} open pull request list hit the 500 cap`);
  }
  return nodes;
}

export async function loadSummerHealth(fetchImpl = fetch) {
  const response = await fetchImpl(SUMMER_HEALTH_URL, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  const textBody = await response.text();
  if (!response.ok) throw new Error(`Summer health HTTP ${response.status}`);
  return JSON.parse(textBody);
}

export async function loadVercelDeployments({
  token,
  teamId = VERCEL_TEAM_ID,
  fetchImpl = fetch,
}) {
  const deployments = {};
  for (const project of VERCEL_PROJECTS) {
    const url = new URL('https://api.vercel.com/v6/deployments');
    url.searchParams.set('projectId', project);
    url.searchParams.set('target', 'production');
    url.searchParams.set('limit', '1');
    url.searchParams.set('teamId', teamId);
    const response = await fetchImpl(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    const textBody = await response.text();
    let body = null;
    try {
      body = JSON.parse(textBody);
    } catch {
      body = null;
    }
    deployments[project] = response.ok
      ? { ok: true, deployment: body?.deployments?.[0] ?? null }
      : { ok: false, status: response.status, body };
  }
  return deployments;
}

async function rdapBaseUrl(domain, fetchImpl, cache) {
  cache.services ??= fetchImpl('https://data.iana.org/rdap/dns.json', {
    signal: AbortSignal.timeout(15_000),
  }).then(response => (response.ok ? response.json() : { services: [] }));
  const tld = domain.split('.').at(-1);
  const services = (await cache.services).services ?? [];
  return services.find(([tlds]) => tlds.includes(tld))?.[1]?.[0] ?? null;
}

/** Whois first; RDAP for registries without port-43 whois (.app, .dev). */
export async function loadDomainRecords({
  domains = COMPANY_DOMAINS,
  whois = domain =>
    execFileAsync('whois', [domain], { timeout: 30_000 }).then(
      ({ stdout }) => stdout
    ),
  fetchImpl = fetch,
} = {}) {
  const cache = {};
  const records = [];
  for (const domain of domains) {
    let record = { domain, observed: false, registered: null };
    try {
      record = parseWhois(domain, await whois(domain));
    } catch (error) {
      console.error(`whois ${domain}: ${error?.message ?? error}`);
    }
    if (!record.observed) {
      try {
        const base = await rdapBaseUrl(domain, fetchImpl, cache);
        const response = base
          ? await fetchImpl(new URL(`domain/${domain}`, base), {
              headers: { accept: 'application/rdap+json' },
              signal: AbortSignal.timeout(15_000),
            })
          : null;
        if (response?.ok) record = parseRdap(domain, await response.json());
      } catch (error) {
        console.error(`rdap ${domain}: ${error?.message ?? error}`);
      }
    }
    records.push(record);
  }
  return records;
}

function warn(message) {
  console.error(message);
  if (process.env.GITHUB_ACTIONS === 'true')
    console.log(`::warning::${message}`);
}

async function main() {
  const mode = argument('--mode') || 'all';
  const dryRun =
    process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
  const token = readVercelReadonlyToken();
  const report = await runRemediationSweep({
    mode,
    dryRun,
    loadPulls: () =>
      loadOpenPullRequests(process.env.GITHUB_REPOSITORY || 'JovieInc/Jovie'),
    loadHealth: () => loadSummerHealth(),
    loadSummerPulls: () => loadSummerConfigPullRequests(),
    loadDeployments: () => loadVercelDeployments({ token: token?.token }),
    loadDomains: () => loadDomainRecords(),
    vercelTokenPresent: Boolean(token),
    upsert: upsertLinearIssueByTitleFingerprint,
    apiKey: process.env.LINEAR_API_KEY,
  });
  for (const message of report.warnings) warn(message);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
