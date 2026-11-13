/**
 * Win-back loop plumbing (founder dispatch, 2026-11-09): when a capability
 * ships, people who asked for it before it existed get a personal draft.
 * NOTHING SENDS from this module on its own — drafts are created
 * `held_for_approval` and the send path refuses without an approval record
 * (template version approved + batch approved by an admin).
 *
 * This file is the PURE half (no db, no server-only): registry parsing,
 * watermark diffing, draft copy, the 14-day outreach budget (JOV-6655) and
 * the approval-record contract. `winback.server.ts` holds the db half.
 *
 * Prior specs: JOV-3382 (canceled), JOV-6655 (contact budget).
 */

import { z } from 'zod';
import type {
  NotificationMessage,
  NotificationTarget,
} from '@/types/notifications';

/**
 * Founder-locked draft copy (dispatch 2026-11-09, quoted verbatim). The
 * wants list is the person's OWN stored words; nothing else may be added.
 */
export const WINBACK_EMAIL_TEMPLATE_VERSION = 'winback_capability_shipped/v1';

/** Waitlist statuses the win-back matcher considers (parallel PR adds
 * `queued`/`disqualified` to the enum; until then only `waitlisted` exists
 * and the matcher simply matches fewer rows). */
export const WINBACK_MATCHABLE_STATUSES = [
  'queued',
  'waitlisted',
  'disqualified',
] as const;

/** JOV-6655: at most one unanswered win-back message per person per 14 days. */
export const WINBACK_OUTREACH_BUDGET_DAYS = 14;
export const WINBACK_OUTREACH_BUDGET_MS =
  WINBACK_OUTREACH_BUDGET_DAYS * 24 * 60 * 60 * 1000;

export const WINBACK_CERTIFIED_CAPABILITIES_KV_KEY =
  'jovie:winback:certified-capabilities:v1';
export const WINBACK_SHIPPED_WATERMARK_KV_KEY =
  'jovie:winback:shipped-watermark:v1';

export function winbackApprovalKvKey(batchId: string): string {
  return `jovie:winback:approval:v1:${batchId}`;
}

export function winbackResumeKvKey(tokenHash: string): string {
  return `jovie:winback:resume:v1:${tokenHash}`;
}

// ---------------------------------------------------------------------------
// Approval record — the ONLY thing that can authorize a win-back send.
// ---------------------------------------------------------------------------

export const winbackApprovalRecordSchema = z.object({
  contract: z.literal('jovie.winback-approval/v1'),
  batchId: z.string().min(1),
  capabilityKey: z.string().min(1),
  // Shape only — the VALUE comparison that produces the specific
  // 'template' refusal lives in winbackSendApprovalError below.
  templateVersion: z.string().min(1),
  /** Exact entry ids approved for this batch. */
  entryIds: z.array(z.string().uuid()).min(1),
  approvedBy: z.string().min(1),
  approvedAt: z.string().datetime(),
});

export type WinbackApprovalRecord = z.infer<typeof winbackApprovalRecordSchema>;

/**
 * Fail-closed send gate. A send may proceed only when an approval record
 * exists for the batch, pins the same template version, and lists the entry.
 */
export function winbackSendApprovalError(
  approval: unknown,
  params: { batchId: string; templateVersion: string; entryId: string }
): string | null {
  const parsed = winbackApprovalRecordSchema.safeParse(approval);
  if (!parsed.success) {
    return `winback send refused: no valid approval record for batch ${params.batchId}`;
  }
  if (parsed.data.batchId !== params.batchId) {
    return `winback send refused: approval record batch ${parsed.data.batchId} does not match job batch ${params.batchId}`;
  }
  if (parsed.data.templateVersion !== params.templateVersion) {
    return `winback send refused: approved template ${parsed.data.templateVersion} does not match job template ${params.templateVersion}`;
  }
  if (!parsed.data.entryIds.includes(params.entryId)) {
    return `winback send refused: entry ${params.entryId} is not in approved batch ${params.batchId}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 14-day outreach budget (JOV-6655).
// ---------------------------------------------------------------------------

/**
 * True when a new win-back message is allowed. `lastUnansweredSentAt` is the
 * timestamp of the most recent win-back send for this person that never got
 * a reply/open/click; null means the budget is free.
 */
export function isWithinWinbackOutreachBudget(params: {
  lastUnansweredSentAt: Date | null;
  now: Date;
}): boolean {
  if (!params.lastUnansweredSentAt) return true;
  return (
    params.now.getTime() - params.lastUnansweredSentAt.getTime() >=
    WINBACK_OUTREACH_BUDGET_MS
  );
}

// ---------------------------------------------------------------------------
// Capability-shipped signal: FEATURE_REGISTRY.md is the canonical registry.
// ---------------------------------------------------------------------------

export interface ShippedCapability {
  /** FEATURE_REGISTRY stable id when one exists, else a slugified name. */
  readonly key: string;
  readonly label: string;
  readonly status: string;
}

/** Stable ids from the "Stable Feature IDs" table of FEATURE_REGISTRY.md. */
export function parseStableFeatureIds(
  registryMarkdown: string
): ReadonlyMap<string, string> {
  const ids = new Map<string, string>();
  const row = /^\| `?([a-z0-9][a-z0-9-]*)`? \| (.+) \|$/gm;
  let inStableIds = false;
  for (const line of registryMarkdown.split('\n')) {
    if (/^#{2,3} /.test(line)) {
      inStableIds = /^#{2,3} Stable Feature IDs$/.test(line.trim());
      continue;
    }
    if (!inStableIds) continue;
    const match = row.exec(line);
    row.lastIndex = 0;
    if (match && /^[a-z0-9-]+$/.test(match[1])) {
      ids.set(match[2].trim().toLowerCase(), match[1]);
    }
  }
  return ids;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Parse the Product Feature List for capabilities whose Status marks them
 * shipped. `capability_key` values are FEATURE_REGISTRY stable ids when the
 * feature has one, else the slug of its product feature name.
 */
export function parseShippedCapabilities(
  registryMarkdown: string
): ShippedCapability[] {
  const stableIds = parseStableFeatureIds(registryMarkdown);
  const capabilities: ShippedCapability[] = [];
  let inProductList = false;
  for (const line of registryMarkdown.split('\n')) {
    if (/^#{2,3} /.test(line)) {
      inProductList = /^#{2,3} Product Feature List$/.test(line.trim());
      continue;
    }
    if (!inProductList || !line.startsWith('| ')) continue;
    const cells = line.split('|').map(cell => cell.trim());
    // | area | feature | status | access | flag | notes |
    if (cells.length < 4) continue;
    const feature = cells[2];
    const status = cells[3];
    if (!feature || !status) continue;
    if (!/^Shipped( \(|$)/.test(status)) continue;
    const key = stableIds.get(feature.toLowerCase()) ?? slugify(feature);
    capabilities.push({ key, label: feature, status });
  }
  return capabilities;
}

/** Watermark diff: which shipped+certified keys are new since the last run. */
export function diffNewlyShippedCertifiedCapabilities(params: {
  registryMarkdown: string;
  certifiedKeys: readonly string[];
  previousKeys: readonly string[] | null;
}): { currentKeys: string[]; newlyAvailable: string[] } {
  const certified = new Set(params.certifiedKeys);
  const currentKeys = parseShippedCapabilities(params.registryMarkdown)
    .map(capability => capability.key)
    .filter(key => certified.has(key));
  const previous = new Set(params.previousKeys ?? []);
  return {
    currentKeys,
    newlyAvailable: currentKeys.filter(key => !previous.has(key)),
  };
}

// ---------------------------------------------------------------------------
// Draft copy.
// ---------------------------------------------------------------------------

/** "a, b and c" — the locked copy joins wants in the person's own words. */
export function formatWantList(wants: readonly string[]): string {
  const picked = wants.slice(0, 3);
  if (picked.length === 0) return '';
  if (picked.length === 1) return picked[0];
  return `${picked.slice(0, -1).join(', ')} and ${picked[picked.length - 1]}`;
}

export function buildWinbackDraftCopy(params: {
  wants: readonly string[];
  capabilityLabel: string;
  handle: string;
  resumeUrl: string;
}): { subject: string; body: string } {
  const wantList = formatWantList(params.wants);
  const body =
    `You reached out wanting to ${wantList}. We weren't ready then. ` +
    `We just shipped ${params.capabilityLabel}, and we'd love for you to be ` +
    `the first to try it. Your handle jov.ie/${params.handle} is still ` +
    `yours: ${params.resumeUrl}`;
  return { subject: `We just shipped ${params.capabilityLabel}`, body };
}

/** Signed resume link that lands in setup. */
export function buildWinbackResumeUrl(origin: string, token: string): string {
  return `${origin}/start?resume=winback&w=${token}`;
}

/**
 * Founder-locked win-back email (dispatch 2026-11-09). Body copy is built
 * from the person's OWN wants words plus the shipped capability label and
 * their reserved handle. Nothing else is added.
 */
export function buildWinbackEmail(params: {
  email: string;
  fullName: string | null;
  wants: readonly string[];
  capabilityLabel: string;
  handle: string;
  resumeUrl: string;
  dedupKey: string;
}): { message: NotificationMessage; target: NotificationTarget } {
  const name = (params.fullName ?? '').trim();
  const greeting = name ? `Hi ${name},` : 'Hi,';
  const wantList = formatWantList(params.wants);
  const lead =
    `You reached out wanting to ${wantList}. We weren't ready then. ` +
    `We just shipped ${params.capabilityLabel}, and we'd love for you to be ` +
    `the first to try it. Your handle jov.ie/${params.handle} is still ` +
    `yours: ${params.resumeUrl}`;
  const subject = `We just shipped ${params.capabilityLabel}`;
  const text = `${greeting}\n\n${lead}\n`;
  const html = `<p>${greeting}</p><p>${lead}</p>`;

  return {
    target: { email: params.email },
    message: {
      id: params.dedupKey,
      dedupKey: params.dedupKey,
      idempotencyKey: params.dedupKey,
      category: 'transactional',
      emailRoute: {
        stream: 'transactional',
        purpose: 'winback-capability-shipped',
        consent: 'account-transaction',
      },
      subject,
      text,
      html,
      pushTitle: subject,
      pushBody: lead,
      channels: ['email'],
      respectUserPreferences: false,
      dismissible: false,
    },
  };
}
