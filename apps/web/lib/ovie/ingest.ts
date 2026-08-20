/**
 * Ovie dump-path classify (JOV-5215).
 *
 * One durable receipt per item. Never spawn a worker per item. Company
 * work (flash/heavy/engineering) goes to the Summer-owned Kanban. Personal
 * never goes to company Kanban or Linear. Taste stays Taste. Eve does not
 * route Linear→Symphony. Destination writer is ovie-intake-to-kanban.py.
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

const PERSONAL = [
  'liv',
  'remind me',
  'apartment',
  'mailbox',
  't@timwhite',
  'personal',
  'shopping',
  'catalina',
  'travel',
] as const;

const TASTE = [
  'taste',
  'swipe',
  'hero',
  'too salesy',
  'visual approval',
  'does this look',
] as const;

const ENGINEERING = [
  'bug',
  'broken',
  '500',
  'crash',
  'ci ',
  ' ci',
  'pr ',
  'signup',
  '/start',
  'traceback',
  'typeerror',
  'jovie bug',
] as const;

const FLASH = [
  'tweet',
  'post this',
  'x.com',
  'do this now',
  'send this',
  'slack',
] as const;

const HEAVY = [
  'research',
  'eval',
  'skill lock',
  'dogfood',
  'deep dive',
  'write evals',
  'growth ideas',
] as const;

function includesAny(text: string, keys: readonly string[]): boolean {
  return keys.some(key => text.includes(key));
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
  return DEST_KANBAN;
}

export function ingestOvieItem(
  text: string,
  options?: { readonly spawn?: SpawnFn }
): OvieReceipt {
  void options?.spawn;
  const lane = classifyOvieItem(text);
  const destination = destinationForOvieLane(lane);
  return {
    text,
    lane,
    destination,
    ack: OVIE_QUEUED_ACK,
    destinationHandle: null,
    workerSpawned: false,
  };
}

export function ingestOvieDump(
  items: readonly string[],
  options?: { readonly spawn?: SpawnFn }
): OvieReceipt[] {
  void options?.spawn;
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
