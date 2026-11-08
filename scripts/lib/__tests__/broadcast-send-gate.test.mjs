import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { main as sendChangelog } from '../../send-changelog-email.mjs';
import {
  assertBroadcastAllowed,
  filterRecipients,
  hashEmail,
} from '../broadcast-send-gate.mjs';
import { loadStreamRegistry } from '../mail-send-guard.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const registry = loadStreamRegistry(root);

const temporaryRoots = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const path of temporaryRoots.splice(0))
    rmSync(path, { recursive: true, force: true });
});
function fixtureRoot() {
  const path = mkdtempSync(resolve(tmpdir(), 'broadcast-gate-contract-'));
  temporaryRoots.push(path);
  return path;
}

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

describe('broadcast send gate fails closed', () => {
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
