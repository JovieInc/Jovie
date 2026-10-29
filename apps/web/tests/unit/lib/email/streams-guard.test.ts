import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CORE_DOMAIN,
  DEFAULT_STREAM_DOMAIN,
  isCoreDomain,
  TARGET_STREAM_DOMAIN,
} from '@/lib/email/streams';
import { isColdClaimInviteSendOpen } from '@/lib/outbound/cold-claim-invites';

/**
 * Guard: cold outreach never uses jov.ie or any subdomain, and never rides a
 * provider whose terms forbid it. Fails the build rather than the sender
 * reputation. See lib/email/streams.ts.
 */
const WEB_ROOT = resolve(__dirname, '../../../..');

// Modules that send to people who never opted in (the cold stream).
const COLD_MODULES = [
  'lib/email/jobs/send-claim-invite.ts',
  'lib/leads/instantly.ts',
  'lib/outbound',
];

function walk(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap(name => {
    const full = join(path, name);
    return /\.(test|spec)\./.test(name) ? [] : walk(full);
  });
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('email stream guard', () => {
  it('has no default or target cold domain, and none under jov.ie', () => {
    expect(DEFAULT_STREAM_DOMAIN.cold).toBeNull();
    expect(TARGET_STREAM_DOMAIN.cold).toBeNull();
    for (const map of [DEFAULT_STREAM_DOMAIN, TARGET_STREAM_DOMAIN]) {
      if (map.cold) expect(isCoreDomain(map.cold)).toBe(false);
    }
  });

  it('keeps jov.ie addresses out of cold-stream modules', () => {
    const offenders: string[] = [];
    for (const mod of COLD_MODULES) {
      for (const file of walk(join(WEB_ROOT, mod))) {
        const text = readFileSync(file, 'utf8');
        const hits = text.match(
          new RegExp(
            `from:\\s*[^\\n]*@(?:[a-z0-9-]+\\.)*${CORE_DOMAIN.replace('.', '\\.')}`,
            'gi'
          )
        );
        if (hits) offenders.push(`${relative(WEB_ROOT, file)}: ${hits[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('cold claim invites stay closed while they still send through Resend', () => {
    const job = readFileSync(
      join(WEB_ROOT, 'lib/email/jobs/send-claim-invite.ts'),
      'utf8'
    );
    const usesResend = /ResendEmailProvider/.test(job);
    // Resend forbids unsolicited mail. Re-open only after the invite moves to a
    // cold-capable tool on a non-jov.ie domain.
    if (usesResend) expect(isColdClaimInviteSendOpen()).toBe(false);
  });

  it('no non-test module sends from a hardcoded address outside the stream registry', () => {
    const allowed = new Set([
      'lib/email/streams.ts',
      'lib/notifications/sender-policy.ts',
      'lib/email/templates/auth-otp.ts',
    ]);
    const pattern =
      /['"`][^'"`\n]*<?[a-z0-9._-]+@(?:send|notify|mail|updates|in|inbox)\.jov\.ie>?['"`]/i;
    const offenders = walk(join(WEB_ROOT, 'lib'))
      .map(f => relative(WEB_ROOT, f))
      .filter(f => /\.tsx?$/.test(f) && !allowed.has(f))
      .filter(f =>
        pattern.test(stripComments(readFileSync(join(WEB_ROOT, f), 'utf8')))
      );
    expect(offenders).toEqual([]);
  });
});
