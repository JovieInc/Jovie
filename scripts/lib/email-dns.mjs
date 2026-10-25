/**
 * SPF / DKIM / DMARC / BIMI checks for the sending domains (pure, resolver
 * injected). A failure is a finding string; the loop's `dnsFailures` metric is
 * the count of findings with a failing verdict. Informational facts (DMARC
 * policy, BIMI presence) are returned separately and never fail the loop.
 *
 * Why these rules: a domain with more than one DMARC record has no DMARC
 * policy at all (RFC 7489 section 6.6.3: multiple records are discarded), more
 * than one SPF record is a permerror (RFC 7208 section 4.5), and SPF over ten
 * DNS lookups is a permerror (section 4.6.4). Each silently drops mail at
 * receivers that enforce bulk-sender rules (Gmail and Yahoo, 2024).
 */

export const SENDING_DOMAINS = Object.freeze([
  // Header From domain on sign-in mail (no-reply@jov.ie), DKIM d=jov.ie.
  { domain: 'jov.ie', role: 'from', dkimSelectors: ['resend'] },
  // Return-Path / bounce domain (SES envelope sender via Resend).
  { domain: 'send.jov.ie', role: 'return-path', dkimSelectors: ['resend'] },
]);

const SPF_LOOKUP_LIMIT = 10;

export async function safeTxt(resolver, name) {
  try {
    const rows = await resolver.resolveTxt(name);
    return rows.map(parts =>
      Array.isArray(parts) ? parts.join('') : String(parts)
    );
  } catch (error) {
    if (['ENODATA', 'ENOTFOUND', 'NXDOMAIN'].includes(error?.code)) return [];
    throw error;
  }
}

async function safeMx(resolver, name) {
  try {
    return await resolver.resolveMx(name);
  } catch (error) {
    if (['ENODATA', 'ENOTFOUND', 'NXDOMAIN'].includes(error?.code)) return [];
    throw error;
  }
}

const isSpf = record => /^v=spf1(\s|$)/i.test(record.trim());
const isDmarc = record => /^v=DMARC1\s*;?/i.test(record.trim());

/** Count DNS-querying terms, following include and redirect. */
export async function countSpfLookups(
  resolver,
  record,
  depth = 0,
  seen = new Set()
) {
  if (depth > 6) return SPF_LOOKUP_LIMIT + 1;
  let count = 0;
  for (const term of record.trim().split(/\s+/).slice(1)) {
    const mech = term.replace(/^[+\-~?]/, '').toLowerCase();
    if (/^(a|mx|ptr)([:/]|$)/.test(mech) || mech.startsWith('exists:')) {
      count += 1;
    } else if (mech.startsWith('include:') || mech.startsWith('redirect=')) {
      count += 1;
      const target = mech.split(/[:=]/)[1];
      if (target && !seen.has(target)) {
        seen.add(target);
        const nested = (await safeTxt(resolver, target)).find(isSpf);
        if (nested)
          count += await countSpfLookups(resolver, nested, depth + 1, seen);
      }
    }
  }
  return count;
}

export async function checkSpf(resolver, domain) {
  const records = (await safeTxt(resolver, domain)).filter(isSpf);
  if (records.length === 0) return [`${domain}: no SPF record`];
  if (records.length > 1) {
    return [
      `${domain}: ${records.length} SPF records (permerror, receivers ignore SPF)`,
    ];
  }
  const record = records[0];
  const findings = [];
  const all = record.match(/\s([+\-~?]?)all\s*$/i);
  if (!all) findings.push(`${domain}: SPF has no terminal "all" mechanism`);
  else if (all[1] === '+' || all[1] === '?') {
    findings.push(
      `${domain}: SPF ends with "${all[1]}all" (does not restrict senders)`
    );
  }
  const lookups = await countSpfLookups(resolver, record);
  if (lookups > SPF_LOOKUP_LIMIT) {
    findings.push(
      `${domain}: SPF needs ${lookups} DNS lookups (limit ${SPF_LOOKUP_LIMIT}, permerror)`
    );
  }
  return findings;
}

export async function checkDkim(resolver, domain, selector) {
  const name = `${selector}._domainkey.${domain}`;
  const records = await safeTxt(resolver, name);
  if (records.length === 0) return [`${name}: no DKIM key published`];
  const key = records.join('').match(/(?:^|;)\s*p=([^;\s]*)/i)?.[1];
  if (!key) return [`${name}: DKIM key is revoked or empty (p= missing)`];
  return [];
}

export async function checkDmarc(resolver, domain) {
  const name = `_dmarc.${domain}`;
  const records = (await safeTxt(resolver, name)).filter(isDmarc);
  const facts = { policy: null, rua: false };
  if (records.length === 0)
    return { findings: [`${name}: no DMARC record`], facts };
  if (records.length > 1) {
    return {
      findings: [
        `${name}: ${records.length} DMARC records (receivers discard all of them, so there is no effective DMARC policy)`,
      ],
      facts,
    };
  }
  const tags = Object.fromEntries(
    records[0]
      .split(';')
      .map(part => part.trim().split('='))
      .filter(([key]) => key)
      .map(([key, ...rest]) => [key.toLowerCase(), rest.join('=')])
  );
  facts.policy = tags.p ?? null;
  facts.rua = Boolean(tags.rua);
  const findings = [];
  if (
    !['none', 'quarantine', 'reject'].includes(
      String(tags.p ?? '').toLowerCase()
    )
  ) {
    findings.push(`${name}: DMARC record has no valid p= policy`);
  }
  return { findings, facts };
}

export async function checkBimi(resolver, domain) {
  const records = (await safeTxt(resolver, `default._bimi.${domain}`)).filter(
    r => /^v=BIMI1/i.test(r.trim())
  );
  if (records.length === 0) return { findings: [], present: false };
  const logo = records[0].match(/(?:^|;)\s*l=([^;\s]*)/i)?.[1] ?? '';
  const findings = /^https:\/\//i.test(logo)
    ? []
    : [`default._bimi.${domain}: BIMI record has no https logo (l=)`];
  return { findings, present: true };
}

export async function checkSendingDomains(resolver, domains = SENDING_DOMAINS) {
  const findings = [];
  const facts = {};
  for (const { domain, role, dkimSelectors } of domains) {
    findings.push(...(await checkSpf(resolver, domain)));
    for (const selector of dkimSelectors) {
      findings.push(...(await checkDkim(resolver, domain, selector)));
    }
    if (role === 'from') {
      const dmarc = await checkDmarc(resolver, domain);
      findings.push(...dmarc.findings);
      const bimi = await checkBimi(resolver, domain);
      findings.push(...bimi.findings);
      facts[domain] = {
        dmarcPolicy: dmarc.facts.policy,
        dmarcRua: dmarc.facts.rua,
        bimi: bimi.present,
      };
    } else {
      const mx = await safeMx(resolver, domain);
      if (mx.length === 0)
        findings.push(`${domain}: no MX for bounce handling`);
    }
  }
  return { findings, facts };
}
