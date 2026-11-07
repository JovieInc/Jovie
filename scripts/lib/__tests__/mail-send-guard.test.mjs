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
import { main as sendChangelog } from '../../send-changelog-email.mjs';
import {
  assertBroadcastAllowed,
  filterRecipients,
  hashEmail,
} from '../broadcast-send-gate.mjs';

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

describe('standalone broadcast safety', () => {
  const cardId = `sc_${'a'.repeat(32)}`;
  const resumeCardId = `sc_${'b'.repeat(32)}`;
  it('resumes only after the stored resume card is approved', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ kind: 'outbound', status: 'approved' }],
        })
        .mockResolvedValueOnce({
          rows: [{ reason: 'bounce threshold', resumeCardId }],
        })
        .mockResolvedValueOnce({ rows: [{ status: 'approved' }] })
        .mockResolvedValueOnce({
          rows: [{ key: 'email-stream-pause:broadcast' }],
        }),
    };
    await expect(
      assertBroadcastAllowed({ client, cardId, mailingAddress: 'Test address' })
    ).resolves.toBeUndefined();
    expect(client.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('status'),
      [`summer-card:${resumeCardId}`]
    );
    expect(client.query).toHaveBeenNthCalledWith(
      4,
      expect.stringMatching(/DELETE[\s\S]+resumeCardId/),
      ['email-stream-pause:broadcast', resumeCardId]
    );
  });

  it.each([null, 'pending', 'rejected'])(
    'keeps a pause when its resume card is not approved (%s)',
    async status => {
      const client = {
        query: vi
          .fn()
          .mockResolvedValueOnce({
            rows: [{ kind: 'outbound', status: 'approved' }],
          })
          .mockResolvedValueOnce({
            rows: [{ reason: 'bounce threshold', resumeCardId }],
          })
          .mockResolvedValueOnce({ rows: status ? [{ status }] : [] }),
      };
      await expect(
        assertBroadcastAllowed({
          client,
          cardId,
          mailingAddress: 'Test address',
        })
      ).rejects.toThrow(/paused/);
      expect(client.query.mock.calls.some(([sql]) => /DELETE/.test(sql))).toBe(
        false
      );
    }
  );

  it('filters suppressed recipients before applying the cap', async () => {
    const subscribers = ['suppressed', 'allowed', 'capped'].map(name => ({
      email: `${name}@example.com`,
    }));
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [{ email_hash: hashEmail(subscribers[0].email) }],
      }),
    };
    await expect(
      filterRecipients({ client, subscribers, perHour: 1 })
    ).resolves.toEqual({ allowed: [subscribers[1]], suppressed: 1, capped: 1 });
  });

  it.each([true, false, 'unavailable'])(
    'requires shared quota before stamping only successful sends (%s)',
    async quota => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const cwd = fixtureRoot();
      mkdirSync(resolve(cwd, 'apps/web/lib/email'), { recursive: true });
      mkdirSync(resolve(cwd, 'apps/web/constants'), { recursive: true });
      const policy = structuredClone(registry);
      policy.streams.broadcast.rateLimit.perHour = 4;
      writeFileSync(
        resolve(cwd, 'apps/web/lib/email/stream-registry.json'),
        JSON.stringify(policy)
      );
      writeFileSync(
        resolve(cwd, 'apps/web/constants/app.ts'),
        "export const LEGAL_ENTITY_NAME = 'Test Company';"
      );
      writeFileSync(
        resolve(cwd, 'CHANGELOG.md'),
        '# Changelog\n\n## [1.2.3] - 2026-11-05\n\n### Added\n\n- New feature.\n'
      );
      const subscribers = [
        'suppressed',
        'sent',
        'api-error',
        'thrown-error',
        'no-ack',
        'capped',
      ].map(name => ({
        email: `${name}@example.com`,
        unsubscribe_token: name,
      }));
      const client = {
        connect: vi.fn(),
        end: vi.fn(),
        query: vi.fn(async (sql, _params = []) => {
          if (sql.includes('AS kind'))
            return { rows: [{ kind: 'outbound', status: 'approved' }] };
          if (sql.includes('AS reason')) return { rows: [] };
          if (sql.includes('SELECT email,')) return { rows: subscribers };
          if (sql.includes('SELECT DISTINCT email_hash'))
            return { rows: [{ email_hash: hashEmail(subscribers[0].email) }] };
          if (sql.includes('UPDATE product_update_subscribers'))
            return { rows: [], rowCount: 1 };
          throw new Error(`Unexpected fake query: ${sql}`);
        }),
      };
      const send = vi.fn(async message => {
        if (message.to.startsWith('api-error'))
          return { data: null, error: { message: 'provider rejected' } };
        if (message.to.startsWith('no-ack')) return { data: null, error: null };
        if (message.to.startsWith('thrown-error'))
          throw new Error('transport rejected');
        return { data: { id: 'fake-message' }, error: null };
      });
      const reserveSharedQuota = vi.fn(async () => {
        if (quota === 'unavailable')
          throw new Error('shared quota unavailable');
        return quota;
      });
      await sendChangelog({
        root: cwd,
        env: {
          RESEND_API_KEY: 'fake',
          DATABASE_URL: 'fake',
          LEGAL_MAILING_ADDRESS: 'Test address',
        },
        argv: ['--force', '--approval-card', cardId],
        createClient: async () => client,
        createEmailClient: async () => ({ emails: { send } }),
        reserveSharedQuota,
      });
      expect(reserveSharedQuota).toHaveBeenCalledTimes(4);
      expect(reserveSharedQuota).toHaveBeenCalledWith({
        stream: 'broadcast',
        perHour: 4,
      });
      if (quota !== true) {
        expect(send).not.toHaveBeenCalled();
        expect(
          client.query.mock.calls.filter(([sql]) =>
            sql.includes('UPDATE product_update_subscribers')
          )
        ).toEqual([]);
        expect(client.end).toHaveBeenCalledOnce();
        return;
      }
      expect(send.mock.calls.map(([message]) => message.to)).toEqual([
        'sent@example.com',
        'api-error@example.com',
        'thrown-error@example.com',
        'no-ack@example.com',
      ]);
      const updates = client.query.mock.calls.filter(([sql]) =>
        sql.includes('UPDATE product_update_subscribers')
      );
      expect(updates).toHaveLength(1);
      expect(updates[0][0]).toMatch(/email = ANY\(\$1/);
      expect(updates[0][1]).toEqual([['sent@example.com']]);
      expect(client.end).toHaveBeenCalledOnce();
      expect(send.mock.calls[0][0]).toMatchObject({
        tags: [
          { name: 'stream', value: 'broadcast' },
          { name: 'purpose', value: 'changelog' },
        ],
        headers: { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      });
      expect(send.mock.calls[0][0].text).toContain(
        'Test Company, Test address'
      );
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
    ])
      expect(guard.inputs.test(path)).toBe(true);
    expect(SCRIPT_CONTRACT_VITEST_TESTS).toContain(
      'scripts/lib/__tests__/mail-send-guard.test.mjs'
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

  it('keeps a concurrently replaced pause closed after resume approval', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ kind: 'outbound', status: 'approved' }],
        })
        .mockResolvedValueOnce({
          rows: [{ reason: 'new pause', resumeCardId: 'sc_resume' }],
        })
        .mockResolvedValueOnce({ rows: [{ status: 'approved' }] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    await expect(
      assertBroadcastAllowed({
        client,
        cardId: 'sc_send',
        mailingAddress: 'Test address',
      })
    ).rejects.toThrow(/paused/);
  });

  it('blocks unapproved cards and missing physical addresses before any send', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValue({ rows: [{ status: 'pending', kind: 'outbound' }] }),
    };
    await expect(
      assertBroadcastAllowed({ client, cardId: 'sc_send', mailingAddress: '' })
    ).rejects.toThrow(/LEGAL_MAILING_ADDRESS/);
    expect(client.query).not.toHaveBeenCalled();
    await expect(
      assertBroadcastAllowed({
        client,
        cardId: null,
        mailingAddress: 'Test address',
      })
    ).rejects.toThrow(/approval-card/);
    expect(client.query).not.toHaveBeenCalled();
    await expect(
      assertBroadcastAllowed({
        client,
        cardId: 'sc_send',
        mailingAddress: 'Test address',
      })
    ).rejects.toThrow(/approved outbound card/);
  });
});

it('blocks the standalone default before constructing clients without a shared quota adapter', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const cwd = fixtureRoot();
  writeFileSync(
    resolve(cwd, 'CHANGELOG.md'),
    '# Changelog\n\n## [1.2.3] - 2026-11-05\n\n### Added\n\n- New feature.\n'
  );
  const createClient = vi.fn(async () => {
    throw new Error('database factory reached');
  });
  const createEmailClient = vi.fn(async () => {
    throw new Error('provider factory reached');
  });
  await expect(
    sendChangelog({
      root: cwd,
      env: { DATABASE_URL: 'fake', RESEND_API_KEY: 'fake' },
      createClient,
      createEmailClient,
    })
  ).rejects.toThrow(/shared.*quota.*unavailable/i);
  expect(createClient).not.toHaveBeenCalled();
  expect(createEmailClient).not.toHaveBeenCalled();
});
