import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SCRIPT_CONTRACT_VITEST_TESTS,
  SOURCE_GUARDS,
} from '../../ci-fast-lanes.mjs';
import { mailGuard } from '../../external-api-guard.mjs';

import {
  buildMailRules,
  callArguments,
  checkMailGuard,
  checkRegistry,
  loadStreamRegistry,
  mailBaseCountsAt,
  mailBaseRatchetAt,
  mailInScope,
  scanMailRepo,
  scanMailSource,
  tightenMailRatchet,
} from '../mail-send-guard.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const registry = loadStreamRegistry(root);
const rules = buildMailRules(registry);
const scan = (path, text) => scanMailSource(path, text, rules);
const counts = hits =>
  Object.fromEntries(
    Object.entries(hits).map(([rule, row]) => [rule, row.count])
  );

describe('mail send guard rules', () => {
  it('flags mail SDKs, provider hosts and SMTP outside the gateway', () => {
    const text = [
      "import { Resend } from 'resend';",
      "const nodemailer = require('nodemailer');",
      'const r = new Resend(key);',
      "await fetch('https://api.resend.com/emails', {});",
      "const t = nodemailer.createTransport({ host: 'smtp.gmail.com' });",
      "await fetch('https://api.instantly.ai/api/v2/leads');",
    ].join('\n');
    expect(counts(scan('apps/web/lib/x.ts', text))).toEqual({
      'mail-sdk': 3,
      'mail-host': 2,
      smtp: 2,
    });
  });

  it('flags Python smtplib', () => {
    const text = 'import smtplib\nserver = smtplib.SMTP("mail.example.com")\n';
    expect(counts(scan('scripts/send.py', text))).toEqual({
      'mail-sdk': 1,
      smtp: 1,
    });
  });

  it('flags hardcoded sender addresses', () => {
    const text = [
      "send({ from: 'Tim <tim@send.jov.ie>', to })",
      "const fromEmail = process.env.X || 'notifications@send.jov.ie';",
      "export const SYSTEM_FROM_EMAIL = 'x@jov.ie';",
      "const label = 'from the team';",
    ].join('\n');
    expect(counts(scan('apps/web/lib/x.ts', text))).toEqual({
      'hardcoded-from': 3,
    });
  });

  it('flags sends without a stream and email notifications without a route', () => {
    const text = [
      "await sendEmail({ to, subject: 's', text: 't', html: 'h' });",
      "await sendEmail({ stream: 'transactional', purpose: 'p', consent: 'auth-request', to });",
      'await sendEmail(options);',
      'await sendEmail({ ...base, to });',
      "await sendNotification({ category: 'transactional', subject: 's', text: 't' }, target);",
      "await sendNotification({ channels: ['sms'], subject: 's', text: 't' }, target);",
      "await sendNotification({ channels: ['email'], emailRoute: route, subject: 's' }, t);",
    ].join('\n');
    const hits = scan('apps/web/lib/x.ts', text);
    expect(hits['send-without-stream']?.count).toBe(2);
    expect(hits['send-without-stream']?.lines).toEqual([1, 5]);
  });

  it('reads call arguments across strings and nested objects', () => {
    const [[, arg]] = callArguments(
      "sendEmail({ subject: 'a ) b', headers: { x: '(' } }) + 1",
      'sendEmail'
    );
    expect(arg).toBe("{ subject: 'a ) b', headers: { x: '(' } }");
  });

  it('exempts the gateway, tests and fixtures', () => {
    expect(mailInScope('apps/web/lib/email/gateway/resend-transport.ts')).toBe(
      false
    );
    expect(mailInScope('apps/web/lib/x.test.ts')).toBe(false);
    expect(mailInScope('apps/web/lib/connectors/gmail/__fixtures__/a.ts')).toBe(
      false
    );
    expect(mailInScope('scripts/lib/mail-send-guard.mjs')).toBe(false);
    expect(mailInScope('apps/web/lib/email/send.ts')).toBe(true);
    expect(mailInScope('scripts/send-changelog-email.mjs')).toBe(true);
  });
});

describe('mail send guard ratchet', () => {
  const found = {
    'a.ts': { 'mail-sdk': { count: 2, lines: [1, 2], fix: 'f' } },
  };

  it('fails a new site and passes a grandfathered one', () => {
    expect(checkMailGuard({ found, ratchet: {} })).toHaveLength(1);
    expect(
      checkMailGuard({ found, ratchet: { 'a.ts': { 'mail-sdk': 2 } } })
    ).toEqual([]);
  });

  it('requires lowering a ratchet that dropped, and never lets it grow', () => {
    expect(
      checkMailGuard({ found: {}, ratchet: { 'a.ts': { 'mail-sdk': 2 } } })[0]
    ).toMatch(/lower it/);
    expect(
      checkMailGuard({
        found,
        ratchet: { 'a.ts': { 'mail-sdk': 2 } },
        baseRatchet: { 'a.ts': { 'mail-sdk': 1 } },
      }).some(e => /only shrinks/.test(e))
    ).toBe(true);
    expect(tightenMailRatchet({ 'a.ts': { 'mail-sdk': 3 } }, found)).toEqual({
      'a.ts': { 'mail-sdk': 2 },
    });
  });
});

describe('stream registry invariants', () => {
  it('holds on the committed registry', () => {
    expect(checkRegistry(registry)).toEqual([]);
  });

  it('fails cold on jov.ie, cold on Resend, and a broadcast without unsubscribe', () => {
    const bad = structuredClone(registry);
    bad.streams.cold.fromDomain = 'outreach.jov.ie';
    bad.streams.cold.provider = 'resend';
    bad.streams.broadcast.requiredHeaders = [];
    const errors = checkRegistry(bad).join('\n');
    expect(errors).toMatch(/cold may never send from jov\.ie/);
    expect(errors).toMatch(/cold may never use the Resend/);
    expect(errors).toMatch(/broadcast must require one-click unsubscribe/);
    expect(errors).toMatch(/does not permit the cold stream/);
  });

  it('is the file the app imports', () => {
    const streams = readFileSync(
      resolve(root, 'apps/web/lib/email/streams.ts'),
      'utf8'
    );
    expect(streams).toContain("from './stream-registry.json'");
  });
});

const temporaryRoots = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const path of temporaryRoots.splice(0))
    rmSync(path, { recursive: true, force: true });
});
function fixtureRoot() {
  const path = mkdtempSync(resolve(tmpdir(), 'mailguard-contract-'));
  temporaryRoots.push(path);
  return path;
}

describe('standalone mail guard entrypoint', () => {
  it.each([null, '{broken'])(
    'fails closed when the stream registry is absent or invalid (%s)',
    content => {
      const cwd = fixtureRoot();
      if (content !== null) {
        mkdirSync(resolve(cwd, 'apps/web/lib/email'), { recursive: true });
        writeFileSync(
          resolve(cwd, 'apps/web/lib/email/stream-registry.json'),
          content
        );
      }
      expect(mailGuard([], null, [], cwd)).toEqual([
        expect.stringMatching(/missing or not JSON/),
      ]);
    }
  );
});

describe('mailguard integration and immutable base evidence', () => {
  it('registers mail inputs while retaining main guard inputs and tests', () => {
    const guard = SOURCE_GUARDS.find(row => row.id === 'external-api-guard');
    for (const path of [
      'apps/web/lib/email/stream-registry.json',
      'scripts/lib/mail-send-guard.ratchet.gen.json',
      'scripts/lib/subscription-cli-guard.json',
      'scripts/lib/price-literal-guard.ratchet.json',
      'scripts/lib/wall-clock-test-guard.ratchet.json',
      'scripts/lib/hermetic-ci-guard.ratchet.json',
    ])
      expect(guard.inputs.test(path)).toBe(true);
    expect(SCRIPT_CONTRACT_VITEST_TESTS).toContain(
      'scripts/lib/__tests__/mail-send-guard.test.mjs'
    );
    expect(SCRIPT_CONTRACT_VITEST_TESTS).toContain(
      'scripts/lib/__tests__/broadcast-send-gate.test.mjs'
    );
    expect(SCRIPT_CONTRACT_VITEST_TESTS).toContain(
      'scripts/lib/__tests__/source-validation-manifest.test.mjs'
    );
  });

  it('rejects a new bypass through the real mail entrypoint without ratchet changes', () => {
    const cwd = fixtureRoot();
    mkdirSync(resolve(cwd, 'apps/web/lib/email'), { recursive: true });
    mkdirSync(resolve(cwd, 'scripts/lib'), { recursive: true });
    writeFileSync(
      resolve(cwd, 'apps/web/lib/email/stream-registry.json'),
      JSON.stringify(registry)
    );
    writeFileSync(
      resolve(cwd, 'scripts/lib/mail-send-guard.ratchet.gen.json'),
      JSON.stringify({ entries: {} })
    );
    writeFileSync(
      resolve(cwd, 'scripts/bypass.mjs'),
      "import { Resend } from 'resend'; const sender = new Resend(key); sender.emails.send({ from: 'a@example.com' }); sendEmail({ to });"
    );
    const errors = mailGuard([], null, ['scripts/bypass.mjs'], cwd).join('\n');
    expect(errors).toMatch(/mail-sdk: 2 site/);
    expect(errors).toMatch(/hardcoded-from: 1 site/);
    expect(errors).toMatch(/send-without-stream: 1 site/);
    expect(
      JSON.parse(
        readFileSync(
          resolve(cwd, 'scripts/lib/mail-send-guard.ratchet.gen.json'),
          'utf8'
        )
      )
    ).toEqual({ entries: {} });
    const newFile = scanMailRepo(cwd, rules, [
      'missing.mjs',
      'scripts/bypass.mjs',
    ]);
    expect(Object.keys(newFile)).toEqual(['scripts/bypass.mjs']);
  });

  it('reads base source counts and ratchets from the immutable original head', () => {
    const base = '75b234d6bf55b4683d6a577e6e43aa19968b3986';
    expect(
      mailBaseCountsAt(
        base,
        root,
        rules,
        ['scripts/send-changelog-email.mjs', 'missing.mjs'],
        spawnSync
      )['scripts/send-changelog-email.mjs']['mail-sdk']
    ).toBe(2);
    expect(
      mailBaseRatchetAt(base, root, spawnSync)[
        'scripts/send-changelog-email.mjs'
      ]['mail-sdk']
    ).toBe(2);
  });

  it('does not invent base evidence when git or its JSON is unreadable', () => {
    expect(mailBaseCountsAt(null, root, rules, [], vi.fn())).toBeNull();
    expect(
      mailBaseCountsAt('missing', root, rules, [], () => ({ status: 1 }))
    ).toBeNull();
    expect(
      mailBaseCountsAt('base', root, rules, ['a.mjs'], () => ({
        status: 0,
        stdout: Buffer.from('incomplete'),
      }))
    ).toBeNull();
    expect(mailBaseRatchetAt(null, root, vi.fn())).toBeNull();
    expect(
      mailBaseRatchetAt('missing', root, () => ({ status: 1 }))
    ).toBeNull();
    expect(
      mailBaseRatchetAt('base', root, () => ({ status: 0, stdout: '{broken' }))
    ).toBeNull();
  });
});
