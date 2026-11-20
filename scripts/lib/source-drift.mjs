/**
 * Live drift checks (canon/SOURCES_OF_TRUTH.md): where an owner has an
 * external authority, compare the owner with the live system. Findings become
 * remediation plans with a stable fingerprint, so one drift is one Linear
 * issue that is updated, not duplicated. Readers take injected fetch/gh so the
 * comparisons are tested without the network.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Owner prices in USD, read from plan-prices.ts so a change there moves the check. */
export function parseOwnerPrices(text) {
  const pick = re => {
    const m = text.match(re);
    return m ? Number(m[1]) : null;
  };
  const prices = [
    { id: 'pro-monthly', usd: pick(/monthlyUsd:\s*(\d+)/), interval: 'month' },
    {
      id: 'pro-yearly',
      usd: pick(/pro:\s*\{\s*monthly:[^}]*?yearly:\s*(\d+)/s),
      interval: 'year',
    },
    {
      id: 'max-monthly',
      usd: pick(/max:\s*\{\s*monthly:\s*(\d+)/),
      interval: 'month',
    },
    {
      id: 'max-yearly',
      usd: pick(/max:\s*\{[^}]*?yearly:\s*(\d+)/s),
      interval: 'year',
    },
  ];
  return prices.filter(p => p.usd !== null);
}

export function compareStripePrices(ownerPrices, livePrices) {
  const findings = [];
  for (const want of ownerPrices) {
    const cents = Math.round(want.usd * 100);
    const hit = livePrices.some(
      p =>
        p.active !== false &&
        p.currency === 'usd' &&
        p.unit_amount === cents &&
        p.recurring?.interval === want.interval
    );
    if (!hit)
      findings.push({
        check: 'stripe-prices',
        key: want.id,
        message: `plan-prices.ts says ${want.id} is $${want.usd}/${want.interval}, but Stripe has no active USD ${want.interval}ly recurring price of ${cents} cents.`,
      });
  }
  return findings;
}

export function compareEmailDns(domain, txtRecords, dmarcRecords, require) {
  const findings = [];
  if (require.includes('spf') && !txtRecords.some(t => /^v=spf1\b/i.test(t)))
    findings.push({
      check: 'email-dns',
      key: `${domain}-spf`,
      message: `${domain} publishes no SPF record (v=spf1); mail from it can be rejected or spoofed.`,
    });
  if (
    require.includes('dmarc') &&
    !dmarcRecords.some(t => /^v=DMARC1\b/i.test(t))
  )
    findings.push({
      check: 'email-dns',
      key: `${domain}-dmarc`,
      message: `${domain} publishes no DMARC record at _dmarc.${domain}.`,
    });
  return findings;
}

export function compareBuild({
  prodSha,
  behindBy,
  oldestUnreleasedAt,
  nowMs,
  maxBehindCommits,
  maxAgeHours,
}) {
  const findings = [];
  const ageH = oldestUnreleasedAt
    ? (nowMs - Date.parse(oldestUnreleasedAt)) / 3_600_000
    : 0;
  if (behindBy > maxBehindCommits)
    findings.push({
      check: 'production-build',
      key: 'commits',
      message: `Production (${String(prodSha).slice(0, 9)}) is ${behindBy} commits behind main; the limit is ${maxBehindCommits}.`,
    });
  if (behindBy > 0 && ageH > maxAgeHours)
    findings.push({
      check: 'production-build',
      key: 'age',
      message: `The oldest merged-but-unreleased commit is ${Math.round(ageH)} hours old; the limit is ${maxAgeHours}.`,
    });
  return findings;
}

async function dohTxt(name, fetchImpl) {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`;
  const res = await fetchImpl(url, {
    headers: { accept: 'application/dns-json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`DNS-over-HTTPS ${name}: ${res.status}`);
  const body = await res.json();
  return (body.Answer ?? [])
    .filter(a => a.type === 16)
    .map(a => String(a.data).replace(/^"|"$/g, '').replace(/"\s*"/g, ''));
}

async function stripePrices(key, fetchImpl) {
  const out = [];
  let after = '';
  for (let page = 0; page < 10; page += 1) {
    const url = `https://api.stripe.com/v1/prices?active=true&limit=100&type=recurring${after}`;
    const res = await fetchImpl(url, {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Stripe prices: ${res.status}`);
    const body = await res.json();
    out.push(...body.data);
    if (!body.has_more) break;
    after = `&starting_after=${body.data.at(-1).id}`;
  }
  return out;
}

export function driftPlan(finding, extra = '') {
  const fingerprint = `sot-drift-${finding.check}-${finding.key}`;
  return {
    fingerprint,
    title: `Source-of-truth drift: ${finding.message}`.slice(0, 240),
    description: [
      finding.message,
      extra,
      'Source: canon/sources-of-truth.json (liveChecks). Fix the owner or the live system so they agree, then this issue closes itself on the next green run.',
      `Fingerprint: \`${fingerprint}\``,
    ]
      .filter(Boolean)
      .join('\n\n'),
    priority: 2,
    reason: 'source-of-truth-drift',
    createStateName: 'Todo',
    reopenTerminal: true,
  };
}

/**
 * @returns {Promise<{ run: any, findings: any[], plans: any[], warnings: string[] }>}
 */
export async function runDriftChecks({
  root,
  env = process.env,
  fetchImpl = fetch,
  gh,
  now = Date.now,
}) {
  const map = JSON.parse(
    readFileSync(resolve(root, 'canon/sources-of-truth.json'), 'utf8')
  );
  const checks = map.liveChecks;
  const stages = [];
  const findings = [];
  const warnings = [];
  const stage = async (name, fn) => {
    const startedAt = new Date(now()).toISOString();
    try {
      await fn();
      stages.push({
        name,
        startedAt,
        finishedAt: new Date(now()).toISOString(),
        ok: true,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      stages.push({
        name,
        startedAt,
        finishedAt: new Date(now()).toISOString(),
        ok: false,
        reason,
      });
      warnings.push(`Source drift check ${name} unavailable: ${reason}`);
    }
  };

  const stripe = checks['stripe-prices'];
  if (!env[stripe.secretEnv])
    warnings.push(
      `Stripe price drift not judged: ${stripe.secretEnv} is not set (a read-only restricted key is a Tim action).`
    );
  else
    await stage('stripe-prices', async () => {
      const owner = parseOwnerPrices(
        readFileSync(resolve(root, stripe.owner), 'utf8')
      ).filter(p => stripe.ids.includes(p.id));
      if (!owner.length)
        throw new Error(`no prices parsed from ${stripe.owner}`);
      findings.push(
        ...compareStripePrices(
          owner,
          await stripePrices(env[stripe.secretEnv], fetchImpl)
        )
      );
    });

  const dns = checks['email-dns'];
  await stage('email-dns', async () => {
    for (const domain of dns.domains)
      findings.push(
        ...compareEmailDns(
          domain,
          await dohTxt(domain, fetchImpl),
          await dohTxt(`_dmarc.${domain}`, fetchImpl),
          dns.require
        )
      );
  });

  const build = checks['production-build'];
  await stage('production-build', async () => {
    const res = await fetchImpl(build.url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`build-info ${res.status}`);
    const { commitSha } = /** @type {{ commitSha?: string }} */ (
      await res.json()
    );
    if (!commitSha) throw new Error('build-info has no commitSha');
    const cmp = JSON.parse(
      await gh([
        'api',
        `repos/${build.repo}/compare/${commitSha}...main`,
        '--jq',
        '{ahead: .ahead_by, oldest: .commits[0].commit.committer.date}',
      ])
    );
    findings.push(
      ...compareBuild({
        prodSha: commitSha,
        behindBy: cmp.ahead ?? 0,
        oldestUnreleasedAt: cmp.oldest,
        nowMs: now(),
        maxBehindCommits: build.maxBehindCommits,
        maxAgeHours: build.maxAgeHours,
      })
    );
  });

  return {
    run: {
      schema: 'jovie-source-drift-run/v1',
      stages,
      counts: { findings: findings.length },
    },
    findings,
    plans: findings.map(f => driftPlan(f)),
    warnings,
  };
}
