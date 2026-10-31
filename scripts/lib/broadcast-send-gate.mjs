/**
 * Broadcast gate for standalone scripts that cannot import the app's send
 * gateway (apps/web/lib/email/gateway). It applies the same broadcast-stream
 * rules from apps/web/lib/email/stream-registry.json, fail closed:
 *
 *   - an approved Ovie outbound card (`--approval-card sc_...`)
 *   - LEGAL_MAILING_ADDRESS set (CAN-SPAM, JOV-9648) and in the footer
 *   - the broadcast stream not paused by the deliverability loop
 *   - suppressed addresses skipped (email_suppressions, sha256 of the address)
 *   - at most rateLimit.perHour recipients per run
 *   - sender, reply-to and stream tags from the registry
 *
 * The Resend call in scripts/send-changelog-email.mjs stays grandfathered in
 * scripts/lib/mail-send-guard.ratchet.gen.json until it moves behind an
 * internal gateway route.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const STREAM = 'broadcast';

export function loadBroadcastPolicy(root, env = process.env) {
  const registry = JSON.parse(
    readFileSync(join(root, 'apps/web/lib/email/stream-registry.json'), 'utf8')
  );
  const policy = registry.streams[STREAM];
  const domain = env[policy.fromDomainEnv]?.trim() || policy.fromDomain;
  return {
    policy,
    from: `${policy.defaultFromName} <${policy.fromLocalPart}@${domain}>`,
    replyTo: policy.replyTo ?? undefined,
    tags: [
      { name: 'stream', value: STREAM },
      { name: 'purpose', value: 'changelog' },
    ],
    mailingAddressEnv: registry.mailingAddressEnv,
  };
}

export function hashEmail(email) {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

export function cardIdFromArgv(argv) {
  const at = argv.indexOf('--approval-card');
  const value = at >= 0 ? argv[at + 1] : undefined;
  return value && /^sc_[0-9a-f]{32}$/u.test(value) ? value : null;
}

/** Throws with a clear message when any broadcast precondition fails. */
export async function assertBroadcastAllowed({
  client,
  cardId,
  mailingAddress,
}) {
  if (!mailingAddress?.trim())
    throw new Error(
      'broadcast blocked: LEGAL_MAILING_ADDRESS is not set (CAN-SPAM physical address, JOV-9648)'
    );
  if (!cardId)
    throw new Error(
      'broadcast blocked: pass --approval-card <sc_...>, an Ovie outbound card Tim approved for this send'
    );
  const card = await client.query(
    `SELECT value->>'status' AS status, value->>'kind' AS kind
       FROM ovie_operating_kv WHERE key = $1`,
    [`summer-card:${cardId}`]
  );
  const row = card.rows[0];
  if (!row || row.kind !== 'outbound' || row.status !== 'approved')
    throw new Error(
      `broadcast blocked: Ovie card ${cardId} is ${row ? `${row.kind}/${row.status}` : 'missing'}; it must be an approved outbound card`
    );
  const paused = await client.query(
    `SELECT value->>'reason' AS reason FROM ovie_operating_kv WHERE key = $1`,
    [`email-stream-pause:${STREAM}`]
  );
  if (paused.rows[0])
    throw new Error(
      `broadcast blocked: the broadcast stream is paused (${paused.rows[0].reason})`
    );
}

/** Drops suppressed recipients (any active suppression) and caps the run. */
export async function filterRecipients({ client, subscribers, perHour }) {
  if (subscribers.length === 0)
    return { allowed: [], suppressed: 0, capped: 0 };
  const hashes = subscribers.map(s => hashEmail(s.email));
  const res = await client.query(
    `SELECT DISTINCT email_hash FROM email_suppressions
      WHERE email_hash = ANY($1) AND (expires_at IS NULL OR expires_at > NOW())`,
    [hashes]
  );
  const blocked = new Set(res.rows.map(r => r.email_hash));
  const open = subscribers.filter(s => !blocked.has(hashEmail(s.email)));
  const allowed = open.slice(0, Math.max(perHour, 0));
  return {
    allowed,
    suppressed: subscribers.length - open.length,
    capped: open.length - allowed.length,
  };
}

/** LEGAL_ENTITY_NAME from apps/web/constants/app.ts (its one owner). */
export function legalEntityName(root) {
  const source = readFileSync(join(root, 'apps/web/constants/app.ts'), 'utf8');
  const match = /LEGAL_ENTITY_NAME\s*=\s*'([^']+)'/u.exec(source);
  if (!match)
    throw new Error('LEGAL_ENTITY_NAME not found in apps/web/constants/app.ts');
  return match[1];
}

export function postalFooter(entityName, address) {
  return `${entityName}, ${address.trim()}`;
}
