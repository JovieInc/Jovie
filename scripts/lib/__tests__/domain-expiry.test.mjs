import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  extractWorkBlocks,
  resolveActorClass,
  sealWorkOrder,
} from '../../../packages/agent-transport-contracts/work-order.ts';
import { loadDomainRecords } from '../../remediation-sweep.mjs';
import {
  DAY_MS,
  evaluateDomain,
  parseRdap,
  parseWhois,
  planDomainExpiry,
} from '../domain-expiry.mjs';
import { runRemediationSweep } from '../remediation-sweep.mjs';

const fixture = name =>
  readFileSync(
    new URL(`./fixtures/domain-expiry/${name}`, import.meta.url),
    'utf8'
  );
const at = iso => Date.parse(iso);
const JOV_IE_EXPIRY = '2026-11-23T08:06:49.000Z';

describe('domain expiry whois parsing', () => {
  it('reads the jov.ie registry record', () => {
    expect(parseWhois('jov.ie', fixture('jov.ie.whois.txt'))).toEqual({
      domain: 'jov.ie',
      observed: true,
      registered: true,
      expiresAt: JOV_IE_EXPIRY,
      updatedAt: '2026-01-08T09:45:32.000Z',
      registrar: 'InternetX GmbH',
      statuses: ['ok'],
      nameservers: ['ns1.vercel-dns.com', 'ns2.vercel-dns.com'],
    });
  });

  it('ignores the IANA preamble and dedupes registry and registrar rows', () => {
    const record = parseWhois(
      'meetjovie.com',
      fixture('meetjovie.com.whois.txt')
    );
    expect(record).toMatchObject({
      expiresAt: '2026-12-25T18:40:30.000Z',
      registrar: 'Name.com, Inc.',
      statuses: ['clientTransferProhibited'],
      nameservers: ['ns1.vercel-dns.com', 'ns2.vercel-dns.com'],
    });
    expect(record.nameservers.some(ns => ns.includes('gtld'))).toBe(false);
  });

  it('separates an unregistered domain from an unreadable answer', () => {
    expect(
      parseWhois('jovie-lapsed.com', fixture('not-found.whois.txt'))
    ).toEqual({
      domain: 'jovie-lapsed.com',
      observed: true,
      registered: false,
    });
    expect(parseWhois('jovie.dev', fixture('iana-only.whois.txt'))).toEqual({
      domain: 'jovie.dev',
      observed: false,
      registered: null,
    });
    expect(parseWhois('jov.ie', '')).toMatchObject({ observed: false });
  });

  it('reads RDAP for registries without whois', () => {
    const body = JSON.parse(fixture('jovie.dev.rdap.json'));
    expect(parseRdap('jovie.dev', body)).toEqual({
      domain: 'jovie.dev',
      observed: true,
      registered: true,
      expiresAt: '2027-03-18T23:45:37.622Z',
      updatedAt: '2026-04-24T23:16:33.479Z',
      registrar: 'Name.com, Inc.',
      statuses: ['clienttransferprohibited'],
      nameservers: ['ns1.vercel-dns.com', 'ns2.vercel-dns.com'],
    });
    expect(parseRdap('jovie.dev', { events: [] }).observed).toBe(false);
  });
});

describe('domain expiry tiers', () => {
  const jovIe = () => parseWhois('jov.ie', fixture('jov.ie.whois.txt'));

  it('stays quiet past 45 days, files under 45, and escalates under 14', () => {
    const expiry = at(JOV_IE_EXPIRY);
    expect(evaluateDomain(jovIe(), expiry - 46 * DAY_MS)).toMatchObject({
      tier: 'ok',
      daysLeft: 46,
    });
    expect(planDomainExpiry(jovIe(), expiry - 46 * DAY_MS)).toBeNull();
    const remediate = planDomainExpiry(jovIe(), expiry - 45 * DAY_MS);
    expect(remediate).toMatchObject({
      fingerprint: 'domain-expiry:jov.ie',
      priority: 2,
      createStateName: 'Todo',
      reopenTerminal: true,
    });
    expect(remediate.title).toContain('(domain-expiry:jov.ie)');
    // Renewal needs the registrar account only the founder holds, so the
    // order goes out at the remediation tier too — not just inside the
    // founder window (JOV-8078: 44 days out had no actionable path).
    expect(extractWorkBlocks(remediate.description).orders).toHaveLength(1);
    const founder = planDomainExpiry(jovIe(), expiry - 14 * DAY_MS);
    expect(founder.priority).toBe(1);
    expect(extractWorkBlocks(founder.description).orders).toHaveLength(1);
  });

  it('escalates the 2025-11-23 lapse: parking nameservers and a hold', () => {
    const lapsed = parseWhois('jov.ie', fixture('jov.ie-lapsed.whois.txt'));
    const evaluation = evaluateDomain(lapsed, at('2025-11-25T00:00:00Z'));
    expect(evaluation.tier).toBe('founder');
    expect(evaluation.alarms).toEqual([
      'expired 2 days ago',
      'parking nameservers ns1.parklogic.com, ns2.yourdomainhasexpired.com',
      'status clientHold',
    ]);
  });

  it('escalates parking nameservers and a missing registration far from expiry', () => {
    const parked = parseWhois(
      'jovie.ai',
      fixture('parked-afternic.ai.whois.txt')
    );
    expect(evaluateDomain(parked, at('2026-10-04T00:00:00Z'))).toMatchObject({
      tier: 'founder',
      alarms: ['parking nameservers ns3.afternic.com, ns4.afternic.com'],
    });
    const gone = parseWhois('jovie-lapsed.com', fixture('not-found.whois.txt'));
    expect(planDomainExpiry(gone, at('2026-10-04T00:00:00Z'))).toMatchObject({
      priority: 1,
      reason: 'not registered',
    });
  });
});

describe('domain expiry founder order', () => {
  const expiry = at(JOV_IE_EXPIRY);
  const plan = nowMs =>
    planDomainExpiry(parseWhois('jov.ie', fixture('jov.ie.whois.txt')), nowMs);

  it('seals the digest the transport contract verifies, for a founder card', () => {
    const [order] = extractWorkBlocks(
      plan(expiry - 10 * DAY_MS).description
    ).orders;
    // sealWorkOrder throws when the embedded digest differs from its own.
    const sealed = sealWorkOrder(order);
    expect(resolveActorClass(sealed)).toBe('founder-decision');
    expect(sealed.title).toBe('Keep jov.ie registered: expires 2026-11-23');
    expect(sealed.founderAsk?.options.map(option => option.id)).toEqual([
      'renew',
      'let-lapse',
    ]);
  });

  it('writes an identical order on every nightly rerun, across the founder window', () => {
    const orders = [44, 15, 13, 9, 2].map(days =>
      sealWorkOrder(
        extractWorkBlocks(plan(expiry - days * DAY_MS).description).orders[0]
      )
    );
    expect(new Set(orders.map(order => order.digest)).size).toBe(1);
    expect(orders[0].createdAt).toBe('2026-11-09T08:06:49.000Z');
    expect(orders[0].orderId).toBe('domain-continuity-jov-ie-20261109');
  });
});

describe('domain expiry sweep wiring', () => {
  it('files alarms, warns on unread domains, and fails when nothing reads', async () => {
    const records = [
      parseWhois('jov.ie', fixture('jov.ie-lapsed.whois.txt')),
      parseWhois('jovie.dev', fixture('iana-only.whois.txt')),
    ];
    const report = await runRemediationSweep({
      mode: 'domains',
      dryRun: true,
      nowMs: at('2025-11-25T00:00:00Z'),
      loadDomains: async () => records,
    });
    expect(report.issues.map(issue => issue.fingerprint)).toEqual([
      'domain-expiry:jov.ie',
    ]);
    expect(report.warnings).toEqual([
      'No whois or RDAP expiry for jovie.dev; not judged',
    ]);
    await expect(
      runRemediationSweep({
        mode: 'domains',
        dryRun: true,
        loadDomains: async () => [records[1]],
      })
    ).rejects.toThrow(/reader is broken/);
  });

  it('falls back to the IANA-bootstrapped RDAP server when whois has no record', async () => {
    const fetchImpl = vi.fn(async url =>
      String(url) === 'https://data.iana.org/rdap/dns.json'
        ? Response.json({
            services: [
              [['dev', 'app'], ['https://pubapi.registry.google/rdap/']],
            ],
          })
        : Response.json(JSON.parse(fixture('jovie.dev.rdap.json')))
    );
    const [ie, dev] = await loadDomainRecords({
      domains: ['jov.ie', 'jovie.dev'],
      whois: async domain =>
        domain === 'jov.ie'
          ? fixture('jov.ie.whois.txt')
          : fixture('iana-only.whois.txt'),
      fetchImpl,
    });
    expect(ie.expiresAt).toBe(JOV_IE_EXPIRY);
    expect(dev.expiresAt).toBe('2027-03-18T23:45:37.622Z');
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      'https://data.iana.org/rdap/dns.json',
      'https://pubapi.registry.google/rdap/domain/jovie.dev',
    ]);
  });
});
