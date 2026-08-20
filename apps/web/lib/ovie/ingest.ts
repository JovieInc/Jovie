/**
 * Ovie dump-path classify + ack (JOV-5215).
 *
 * One durable receipt per item. Never spawn a worker per item. Engineering
 * goes Linear→Symphony. Personal never goes to Linear. Taste stays Taste.
 * Destination writer is ovie-intake-to-kanban.py.
 */

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
  if (lane === 'engineering') return DEST_LINEAR;
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

/** Process-local only. Not completeness proof. Lost on deploy. */
const receiptLog: OvieReceipt[] = [];
const linearRoutes: OvieReceipt[] = [];

/** In-process receipt log. Durable persist is applyOvieDump → OperatingStore. */
export function persistOvieReceipt(receipt: OvieReceipt): void {
  receiptLog.push(receipt);
}

/**
 * Engineering land path. Only Linear-destination receipts are recorded.
 * Personal/taste/kanban never enter this log. Never spawns a worker.
 */
export function routeEngineeringToLinear(receipt: OvieReceipt): void {
  if (receipt.destination !== DEST_LINEAR) return;
  linearRoutes.push(receipt);
}

export function readOvieReceiptLog(): readonly OvieReceipt[] {
  return receiptLog;
}

export function readOvieLinearRoutes(): readonly OvieReceipt[] {
  return linearRoutes;
}

export function resetOvieIngestLog(): void {
  receiptLog.length = 0;
  linearRoutes.length = 0;
}
