import { describe, expect, it } from 'vitest';
import { checkSendingDomains } from '../email-dns.mjs';

function resolverFor(zone) {
  return {
    async resolveTxt(name) {
      if (!(name in zone)) {
        throw Object.assign(new Error('nodata'), { code: 'ENODATA' });
      }
      return zone[name].map(value => [value]);
    },
    async resolveMx(name) {
      const mx = zone[`MX ${name}`];
      if (!mx) throw Object.assign(new Error('nodata'), { code: 'ENODATA' });
      return mx;
    },
  };
}

const healthy = {
  'jov.ie': ['v=spf1 include:_spf.google.com ~all'],
  '_spf.google.com': ['v=spf1 ip4:1.2.3.4 ~all'],
  'resend._domainkey.jov.ie': ['p=MIGfMA0GCSqGSIb3DQEBAQUAA4GN'],
  '_dmarc.jov.ie': ['v=DMARC1; p=quarantine; rua=mailto:d@jov.ie'],
  'send.jov.ie': ['v=spf1 include:amazonses.com ~all'],
  'amazonses.com': ['v=spf1 ip4:5.6.7.8 -all'],
  'resend._domainkey.send.jov.ie': ['p=MIGfMA0GCSqGSIb3DQEBAQUAA4GN'],
  'MX send.jov.ie': [
    { priority: 10, exchange: 'feedback-smtp.us-east-1.amazonses.com' },
  ],
};

describe('checkSendingDomains', () => {
  it('passes a correctly authenticated pair of domains', async () => {
    const result = await checkSendingDomains(resolverFor(healthy));
    expect(result.findings).toEqual([]);
    expect(result.facts['jov.ie'].dmarcPolicy).toBe('quarantine');
  });

  it('fails the live shape: three DMARC records mean no DMARC policy', async () => {
    const zone = {
      ...healthy,
      '_dmarc.jov.ie': [
        'v=DMARC1; p=none; rua=mailto:dmarc-reports@jov.ie; pct=100; adkim=s; aspf=s',
        'v=DMARC1; p=quarantine; rua=mailto:tim@jov.ie pct=90; sp=none',
        'v=DMARC1; p=none;',
      ],
    };
    const { findings } = await checkSendingDomains(resolverFor(zone));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('3 DMARC records');
  });

  it('does not fail on a p=none policy (informational only)', async () => {
    const zone = { ...healthy, '_dmarc.jov.ie': ['v=DMARC1; p=none;'] };
    const result = await checkSendingDomains(resolverFor(zone));
    expect(result.findings).toEqual([]);
    expect(result.facts['jov.ie'].dmarcPolicy).toBe('none');
  });

  it('fails duplicate SPF, +all, missing and revoked DKIM, missing MX', async () => {
    const zone = {
      ...healthy,
      'jov.ie': ['v=spf1 a ~all', 'v=spf1 mx -all'],
      'send.jov.ie': ['v=spf1 +all'],
      'resend._domainkey.jov.ie': ['p='],
    };
    delete zone['resend._domainkey.send.jov.ie'];
    delete zone['MX send.jov.ie'];
    const { findings } = await checkSendingDomains(resolverFor(zone));
    const text = findings.join('\n');
    expect(text).toContain('2 SPF records');
    expect(text).toContain('"+all"');
    expect(text).toContain('revoked or empty');
    expect(text).toContain('no DKIM key published');
    expect(text).toContain('no MX for bounce handling');
  });

  it('fails SPF that needs more than ten DNS lookups', async () => {
    const includes = Array.from(
      { length: 11 },
      (_, i) => `include:s${i}.example`
    ).join(' ');
    const zone = { ...healthy, 'jov.ie': [`v=spf1 ${includes} ~all`] };
    const { findings } = await checkSendingDomains(resolverFor(zone));
    expect(findings.join('\n')).toContain('11 DNS lookups');
  });

  it('validates BIMI only when published', async () => {
    const bad = {
      ...healthy,
      'default._bimi.jov.ie': ['v=BIMI1; l=http://x/logo.svg'],
    };
    const { findings } = await checkSendingDomains(resolverFor(bad));
    expect(findings.join('\n')).toContain('no https logo');
  });

  it('propagates a resolver outage instead of reading it as absent', async () => {
    const broken = {
      async resolveTxt() {
        throw Object.assign(new Error('timeout'), { code: 'ETIMEOUT' });
      },
      async resolveMx() {
        return [];
      },
    };
    await expect(checkSendingDomains(broken)).rejects.toThrow('timeout');
  });
});
