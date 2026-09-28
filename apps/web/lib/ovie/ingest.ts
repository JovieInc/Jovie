/**
 * Ovie dump-path classify (JOV-5215).
 *
 * One durable receipt per item. Never spawn a worker per item. Company
 * operations work (flash/heavy) goes to the Summer-owned Kanban. Engineering
 * is queued for Summer's Linear intake; Eve never creates Linear work or
 * dispatches Symphony. Personal and Taste stay isolated.
 */

import { denyEveAction } from '@/lib/ovie/eve-authority';
import type { OvieRoutingState } from '@/lib/ovie/mcp/types';

export const OVIE_LANES = [
  'flash',
  'heavy',
  'engineering',
  'personal',
  'taste',
] as const;

export type OvieLane = (typeof OVIE_LANES)[number];

export const DEST_LINEAR = 'linear' as const;
export const DEST_PERSONAL = 'personal-kanban' as const;
export const DEST_KANBAN = 'kanban' as const;
export const DEST_TASTE = 'taste' as const;

export type OvieDestination =
  | typeof DEST_LINEAR
  | typeof DEST_PERSONAL
  | typeof DEST_KANBAN
  | typeof DEST_TASTE;

export type SpawnFn = (goal: string) => void;

/** Incomplete until the Mac lander writes a Kanban task id or Linear identifier. */
export const OVIE_QUEUED_ACK = 'stored and queued for Summer lander';
export const OVIE_LINEAR_QUEUED_ACK =
  'stored and queued for Summer Linear intake';
export const OVIE_UNAVAILABLE_ACK = 'stored; routing unavailable (fail-closed)';
export const OVIE_BLOCKED_ACK = 'stored; routing blocked';

export function ovieAckForHandle(handle: string | null | undefined): string {
  const id = handle?.trim();
  return id ? `landed:${id}` : OVIE_QUEUED_ACK;
}

export type OvieReceipt = {
  readonly text: string;
  readonly lane: OvieLane;
  readonly destination: OvieDestination;
  readonly ack: string;
  readonly destinationHandle: string | null;
  readonly workerSpawned: false;
  readonly workId?: string;
  readonly idempotencyKey?: string;
  readonly persistToAckMs?: number;
  readonly routingState?: OvieRoutingState;
};

/**
 * Signal match semantics (JOV-6419):
 * - `substr`: raw substring. Reserved for multi-word phrases, addresses,
 *   domains, and paths that carry their own context.
 * - `word`: standalone token; both sides must be non-word boundaries.
 *   Used for names and short signals that collide inside other words
 *   (e.g. `liv` inside `deliver`, `live`, `olive`).
 * - `wordStart`: left-boundary token; suffixes like plurals still match
 *   (`bug` matches `bugs`, not `debug`).
 */
type Signal = {
  readonly k: string;
  readonly m: 'substr' | 'word' | 'wordStart';
};

const sub = (k: string): Signal => ({ k, m: 'substr' });
const word = (k: string): Signal => ({ k, m: 'word' });
const wordStart = (k: string): Signal => ({ k, m: 'wordStart' });

const PERSONAL: readonly Signal[] = [
  word('liv'),
  sub('remind me'),
  wordStart('apartment'),
  wordStart('mailbox'),
  sub('t@timwhite'),
  wordStart('personal'),
  wordStart('shopping'),
  wordStart('catalina'),
  wordStart('travel'),
];

const TASTE: readonly Signal[] = [
  wordStart('taste'),
  wordStart('swipe'),
  word('hero'),
  sub('too salesy'),
  sub('visual approval'),
  sub('does this look'),
];

const ENGINEERING: readonly Signal[] = [
  wordStart('bug'),
  wordStart('broken'),
  word('500'),
  wordStart('crash'),
  word('ci'),
  word('pr'),
  wordStart('signup'),
  sub('/start'),
  sub('traceback'),
  sub('typeerror'),
  sub('jovie bug'),
];

const FLASH: readonly Signal[] = [
  wordStart('tweet'),
  sub('post this'),
  sub('x.com'),
  sub('do this now'),
  sub('send this'),
  wordStart('slack'),
];

const HEAVY: readonly Signal[] = [
  wordStart('research'),
  wordStart('eval'),
  sub('skill lock'),
  wordStart('dogfood'),
  sub('deep dive'),
  sub('write evals'),
  sub('growth ideas'),
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function signalMatches(text: string, signal: Signal): boolean {
  if (signal.m === 'substr') return text.includes(signal.k);
  const suffix = signal.m === 'word' ? '\\b' : '';
  return new RegExp(`\\b${escapeRegExp(signal.k)}${suffix}`).test(text);
}

function includesAny(text: string, keys: readonly Signal[]): boolean {
  return keys.some(key => signalMatches(text, key));
}

export function classifyOvieItem(text: string): OvieLane {
  const t = text.toLowerCase();
  if (includesAny(t, PERSONAL)) return 'personal';
  if (includesAny(t, TASTE)) return 'taste';
  if (includesAny(t, ENGINEERING)) return 'engineering';
  if (includesAny(t, FLASH)) return 'flash';
  if (includesAny(t, HEAVY)) return 'heavy';
  return 'heavy';
}

export function destinationForOvieLane(lane: OvieLane): OvieDestination {
  if (lane === 'personal') return DEST_PERSONAL;
  if (lane === 'taste') return DEST_TASTE;
  if (lane === 'engineering') return DEST_LINEAR;
  return DEST_KANBAN;
}

export function queuedAckForDestination(destination: OvieDestination): string {
  return destination === DEST_LINEAR ? OVIE_LINEAR_QUEUED_ACK : OVIE_QUEUED_ACK;
}

export function ingestOvieItem(
  text: string,
  _options?: { readonly spawn?: SpawnFn }
): OvieReceipt {
  const lane = classifyOvieItem(text);
  const destination = destinationForOvieLane(lane);
  return {
    text,
    lane,
    destination,
    ack: queuedAckForDestination(destination),
    destinationHandle: null,
    workerSpawned: false,
  };
}

export function ingestOvieDump(
  items: readonly string[],
  options?: { readonly spawn?: SpawnFn }
): OvieReceipt[] {
  return items.map(item => ingestOvieItem(item, options));
}

/** Chat-route hook: classify the dump. Prefer applyOvieDumpBeforeModel. */
export function ackOvieDumpBeforeModel(userText: string | null): OvieReceipt[] {
  if (!userText || userText.trim() === '') return [];
  return ingestOvieDump([userText]);
}

const receiptLog = new Map<string, OvieReceipt>();
const ackLatencies: number[] = [];

export type OvieIntakeMode = 'normal' | 'receipt-only';

let intakeMode: OvieIntakeMode = 'normal';

export function getOvieIntakeMode(): OvieIntakeMode {
  return intakeMode;
}

export function setOvieIntakeMode(mode: OvieIntakeMode): void {
  intakeMode = mode;
}

function receiptLogKey(receipt: OvieReceipt): string {
  return receipt.workId ?? `${receipt.destination}:${receipt.text}`;
}

/** In-process receipt log. Durable persist is applyOvieDump → OperatingStore. */
export function persistOvieReceipt(receipt: OvieReceipt): void {
  receiptLog.set(receiptLogKey(receipt), receipt);
}

/**
 * Eve must not send engineering to Linear/Symphony. Summer admits that path.
 */
export function routeEngineeringToLinear(_receipt: OvieReceipt): never {
  denyEveAction('symphony-dispatch');
}

export function readOvieReceiptLog(): readonly OvieReceipt[] {
  return [...receiptLog.values()];
}

export function readOvieLinearRoutes(): readonly OvieReceipt[] {
  return [];
}

export function recordOvieAckLatency(ms: number): void {
  ackLatencies.push(ms);
}

export function readOvieAckLatencies(): readonly number[] {
  return ackLatencies;
}

export function resetOvieIngestLog(): void {
  receiptLog.clear();
  ackLatencies.length = 0;
  intakeMode = 'normal';
}
