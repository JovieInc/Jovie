import { createHash } from 'node:crypto';

/**
 * Nightly registrar read for the company's domains. jov.ie lapsed on
 * 2025-11-23 and took the site and email down for weeks; nothing watched the
 * expiry date. This reads public whois (RDAP where a registry has no whois),
 * never the registrar account, and files through the remediation intake.
 */

/** Domains the company owns (Vercel team `jovie` plus jovie.co on Vercel DNS). */
export const COMPANY_DOMAINS = Object.freeze([
  'jov.ie',
  'jovie.app',
  'jovie.co',
  'jovie.dev',
  'jovie.fm',
  'meetjovie.com',
  'logyourbody.com',
]);

export const DAY_MS = 24 * 60 * 60 * 1000;
export const REMEDIATION_DAYS = 45;
export const FOUNDER_DAYS = 14;
export const SWEEP_WORKFLOW_URL =
  'https://github.com/JovieInc/Jovie/actions/workflows/remediation-sweep.yml';

/** Registrar parking and expiry landing nameservers. */
export const PARKING_NAMESERVER = [
  /parklogic/i,
  /yourdomainhasexpired/i,
  /expired/i,
  /afternic/i,
  /sedoparking/i,
  /parkingcrew/i,
  /bodis/i,
];

const HEALTHY_STATUS = [
  /^ok$/i,
  /^active$/i,
  /^registered$/i,
  /^(client|server)(transfer|update|delete|renew)prohibited$/i,
  // Registries that auto-renew at expiry (Cloudflare relies on it) report
  // autoRenewPeriod; the expiry date already carries the risk.
  /^(add|renew|autorenew|transfer)period$/i,
];

const NOT_FOUND = [
  /^no match for/im,
  /^not found/im,
  /^no data found/im,
  /^domain not found/im,
  /^the queried object does not exist/im,
  /^no entries found/im,
];

const EXPIRY_FIELDS = [
  'Registry Expiry Date',
  'Registrar Registration Expiration Date',
  'Expiry Date',
  'Expiration Date',
  'paid-till',
];

function fields(text, name) {
  const pattern = new RegExp(`^\\s*${name}:[ \\t]*(.*)$`, 'gim');
  return [...String(text).matchAll(pattern)]
    .map(match => match[1].trim())
    .filter(Boolean);
}

function date(value) {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

/**
 * Parses the domain record from raw whois text. Only the EPP-style
 * `Domain Status` / `Name Server` lines count: the IANA preamble lists the
 * TLD's own `status:` and `nserver:` rows, which say nothing about the domain.
 */
export function parseWhois(domain, text) {
  const raw = String(text ?? '');
  if (NOT_FOUND.some(pattern => pattern.test(raw))) {
    return { domain, observed: true, registered: false };
  }
  const expiresAt =
    EXPIRY_FIELDS.map(name => date(fields(raw, name)[0])).find(Boolean) ?? null;
  if (!expiresAt) return { domain, observed: false, registered: null };
  const statuses = [];
  for (const value of fields(raw, 'Domain Status')) {
    const status = value.split(/\s+/)[0];
    if (!statuses.some(seen => seen.toLowerCase() === status.toLowerCase()))
      statuses.push(status);
  }
  const nameservers = [
    ...new Set(
      fields(raw, 'Name Server').map(value =>
        value.split(/\s+/)[0].toLowerCase().replace(/\.$/, '')
      )
    ),
  ];
  return {
    domain,
    observed: true,
    registered: true,
    expiresAt,
    updatedAt: date(fields(raw, 'Updated Date')[0]),
    registrar: fields(raw, 'Registrar')[0] ?? null,
    statuses,
    nameservers,
  };
}

/**
 * Parses an RDAP domain response. Google's .app and .dev registries publish
 * RDAP only, and .ie publishes whois only, so the loader tries whois first.
 */
export function parseRdap(domain, body) {
  const expiresAt = date(
    body?.events?.find(event => event?.eventAction === 'expiration')?.eventDate
  );
  if (!expiresAt) return { domain, observed: false, registered: null };
  const registrar = (body.entities ?? []).find(entity =>
    entity?.roles?.includes('registrar')
  );
  const name = registrar?.vcardArray?.[1]?.find(row => row?.[0] === 'fn')?.[3];
  return {
    domain,
    observed: true,
    registered: true,
    expiresAt,
    updatedAt: date(
      body.events.find(event => event?.eventAction === 'last changed')
        ?.eventDate
    ),
    registrar: typeof name === 'string' ? name : null,
    statuses: (body.status ?? []).map(status =>
      String(status).replace(/\s+/g, '')
    ),
    nameservers: (body.nameservers ?? [])
      .map(ns =>
        String(ns?.ldhName ?? '')
          .toLowerCase()
          .replace(/\.$/, '')
      )
      .filter(Boolean),
  };
}

/** Days left, the alarms, and the tier: `ok`, `remediate` or `founder`. */
export function evaluateDomain(record, nowMs) {
  if (!record?.observed) return { tier: 'unobserved', alarms: [] };
  if (!record.registered) {
    return { tier: 'founder', daysLeft: null, alarms: ['not registered'] };
  }
  const daysLeft = Math.floor((Date.parse(record.expiresAt) - nowMs) / DAY_MS);
  const alarms = [];
  if (daysLeft < 0) alarms.push(`expired ${-daysLeft} days ago`);
  else if (daysLeft <= REMEDIATION_DAYS)
    alarms.push(`expires in ${daysLeft} days`);
  const parked = record.nameservers.filter(ns =>
    PARKING_NAMESERVER.some(pattern => pattern.test(ns))
  );
  if (parked.length > 0)
    alarms.push(`parking nameservers ${parked.join(', ')}`);
  const unhealthy = record.statuses.filter(
    status => !HEALTHY_STATUS.some(pattern => pattern.test(status))
  );
  if (unhealthy.length > 0) alarms.push(`status ${unhealthy.join(', ')}`);
  if (record.statuses.length === 0) alarms.push('no domain status');
  const critical =
    daysLeft <= FOUNDER_DAYS || parked.length > 0 || unhealthy.length > 0;
  return {
    tier: critical ? 'founder' : alarms.length > 0 ? 'remediate' : 'ok',
    daysLeft,
    alarms,
  };
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Mirrors `sealWorkOrder` in packages/agent-transport-contracts/work-order.ts.
 * This job runs without a pnpm install, so the test proves the digests match.
 */
export function sealOrder(order) {
  const digest = createHash('sha256')
    .update(`jovie.work-order/v1\0${canonical(order)}`)
    .digest('hex');
  return { ...order, digest };
}

function renderOrderBlock(order) {
  const key = createHash('sha256').update(order.idempotencyKey).digest('hex');
  const marker = `<!-- jovie-work-order:${key.slice(0, 16)}:r${order.revision} -->`;
  return `${marker}\n\`\`\`json\n${JSON.stringify(order, null, 2)}\n\`\`\``;
}

/**
 * A founder-decision work order Summer turns into one Ovie card (JOV-7739).
 * Every field derives from the whois record, so reruns write the same digest
 * and Summer replays the same card. A record change (renewal, hold, new
 * nameservers) is a material change and asks again. The anchor pins to the
 * founder-window start so the order is identical whether the issue files at
 * the remediation tier (45 days out) or inside the founder window.
 */
export function founderOrder(record, evaluation, nowMs) {
  const expiryMs = record.expiresAt ? Date.parse(record.expiresAt) : null;
  const windowStart =
    expiryMs === null ? null : expiryMs - FOUNDER_DAYS * DAY_MS;
  const anchorMs =
    windowStart ??
    (Date.parse(record.updatedAt ?? '') || Math.floor(nowMs / DAY_MS) * DAY_MS);
  const createdAt = new Date(anchorMs).toISOString();
  const deadline = new Date(
    Math.max(expiryMs ?? 0, anchorMs + 7 * DAY_MS)
  ).toISOString();
  const slug = record.domain.replace(/[^A-Za-z0-9]+/g, '-');
  const stamp = createdAt.slice(0, 10).replaceAll('-', '');
  // Day counts change nightly; the order names the date so its digest holds.
  const problem = evaluation.alarms
    .map(alarm =>
      alarm.startsWith('expire')
        ? `${evaluation.daysLeft < 0 ? 'expired' : 'expires'} ${record.expiresAt.slice(0, 10)}`
        : alarm
    )
    .join('; ');
  return sealOrder({
    schema: 'jovie.work-order/v1',
    orderId: `domain-continuity-${slug}-${stamp}`,
    revision: 1,
    idempotencyKey: `domain-expiry-${slug}-${stamp}`,
    gate: { objectiveRef: 'JOV-7701', gateId: 'domain-continuity' },
    state: 'open',
    title: `Keep ${record.domain} registered: ${problem}`.slice(0, 120),
    outcome: `${record.domain} stays registered more than ${REMEDIATION_DAYS} days out, status ok, on its own nameservers.`,
    successPredicate: {
      id: 'domain-continuity',
      statement: `The nightly whois read of ${record.domain} shows expiry more than ${REMEDIATION_DAYS} days out, a healthy status, and no parking nameservers.`,
      verifier: 'runtime-probe',
    },
    requiredCapabilities: ['decision', 'permission'],
    riskTier: 'critical',
    authorityClass: 'founder',
    scope: {
      target: record.domain,
      entityRefs: [`registrar:${record.registrar ?? 'unknown'}`],
    },
    evidence: [
      { ref: SWEEP_WORKFLOW_URL, observedAt: createdAt, freshness: 'fresh' },
    ],
    permittedActions: [
      'renew-domain',
      'enable-auto-renew',
      'restore-nameservers',
    ],
    forbiddenActions: ['transfer-domain'],
    budget: {
      deadline,
      maxAttempts: 1,
      maxSpendUsd: 0,
      maxConcurrency: 1,
      founderMinutes: 10,
    },
    stopConditions: [
      `The whois read shows ${record.domain} healthy and more than ${REMEDIATION_DAYS} days from expiry.`,
    ],
    escalation: {
      owner: 'founder',
      action: `Renew ${record.domain} at ${record.registrar ?? 'its registrar'}, turn on auto-renew, and keep its nameservers.`,
    },
    expectedArtifact: {
      kind: 'state-change',
      description: `A registrar renewal or repair that clears: ${problem}.`,
    },
    founderAsk: {
      whyNow: `${record.domain}: ${problem}. jov.ie lapsed on 2025-11-23 and the site and email were down for weeks.`,
      blocked:
        'Renewal needs the registrar account and payment, which only the founder holds.',
      options: [
        {
          id: 'renew',
          label: 'Renew now',
          tradeoff: 'A few minutes and the renewal fee; the domain stays up.',
        },
        {
          id: 'let-lapse',
          label: 'Let it lapse',
          tradeoff:
            'Everything served or mailed from this domain stops when it expires.',
        },
      ],
      recommendation: `Renew ${record.domain} for at least a year and turn on auto-renew.`,
      defaultIfSilent: 'Nothing renews; the alarm repeats nightly.',
      materialChange: null,
    },
    replyTo: { kind: 'linear-comment', ref: 'JOV-7701' },
    createdAt,
    createdBy: 'remediation-sweep',
  });
}

/**
 * One remediation plan per alarming domain, fingerprint
 * `domain-expiry:<domain>`. Every alarm resolves at the registrar account,
 * which only the founder holds, so each filing carries the founder work
 * order; the founder tier only raises the Linear priority.
 */
export function planDomainExpiry(record, nowMs) {
  const evaluation = evaluateDomain(record, nowMs);
  if (evaluation.tier === 'ok' || evaluation.tier === 'unobserved') return null;
  const fingerprint = `domain-expiry:${record.domain}`;
  const founder = evaluation.tier === 'founder';
  const facts = record.registered
    ? [
        `Expires ${record.expiresAt} (${evaluation.daysLeft} days).`,
        `Registrar: ${record.registrar ?? 'unknown'}.`,
        `Status: ${record.statuses.join(', ') || 'none'}.`,
        `Nameservers: ${record.nameservers.join(', ') || 'none'}.`,
      ]
    : ['Whois reports no registration. Anyone can register it now.'];
  const description = [
    `${record.domain}: ${evaluation.alarms.join('; ')}.`,
    ...facts,
    `Filed under ${REMEDIATION_DAYS} days or on parking nameservers or a non-ok status. Renewal and nameserver repair need the registrar account only the founder holds, so every filing carries a founder work order for an Ovie card; under ${FOUNDER_DAYS} days or on any parking/status alarm the issue also files at founder priority.`,
    renderOrderBlock(founderOrder(record, evaluation, nowMs)),
    `Fingerprint: \`${fingerprint}\``,
  ]
    .filter(Boolean)
    .join('\n\n');
  return {
    fingerprint,
    title:
      `${record.domain} registration at risk: ${evaluation.alarms.join('; ')} (${fingerprint})`.slice(
        0,
        240
      ),
    description,
    priority: founder ? 1 : 2,
    reason: evaluation.alarms.join('; '),
    createStateName: 'Todo',
    reopenTerminal: true,
  };
}
