import { createHash, randomUUID } from 'node:crypto';
import type { OvieReceipt } from '@/lib/ovie/ingest';
import { isSummerSafeTool } from '@/lib/ovie/isolation';
import type { OperatingStore } from '@/lib/ovie/mcp/store';
import type { OvieSummerTurn } from '@/lib/ovie/mcp/types';
import { assertModelMustNotSelfIdentifyAsOvie } from '@/lib/ovie/program';
import {
  CURRENT_SUMMER_SESSION_ID,
  eveBindingFromReceipts,
} from '@/lib/ovie/summer-session';

const DEFAULT_CLAIM_TTL_SECONDS = 120;

export class OvieSummerTurnError extends Error {
  constructor(
    readonly code: 'conflict' | 'claim',
    readonly turnId: string
  ) {
    super(`Ovie Summer turn ${code}: ${turnId}`);
    this.name = 'OvieSummerTurnError';
  }
}

export function ovieSummerTurnId(input: {
  readonly conversationId: string;
  readonly clientTurnId: string;
}): string {
  const digest = createHash('sha256')
    .update(`${input.conversationId.trim()}:${input.clientTurnId.trim()}`)
    .digest('base64url')
    .slice(0, 24);
  return `sum_${digest}`;
}

export async function enqueueOvieSummerTurn(
  store: OperatingStore,
  input: {
    readonly id: string;
    readonly conversationId?: string;
    readonly userText: string;
    readonly receipts?: readonly OvieReceipt[];
    readonly now?: Date;
  }
): Promise<OvieSummerTurn> {
  const id = input.id.trim();
  const conversationId =
    input.conversationId?.trim() || CURRENT_SUMMER_SESSION_ID;
  const userText = input.userText.trim();
  if (!id || !userText) {
    throw new Error('Summer turn requires id and userText');
  }
  const existing = await store.getSummerTurn(id);
  if (existing) {
    if (
      existing.conversationId !== conversationId ||
      existing.userText !== userText
    ) {
      throw new OvieSummerTurnError('conflict', id);
    }
    return existing;
  }
  const now = (input.now ?? new Date()).toISOString();
  const binding = eveBindingFromReceipts(input.receipts ?? []);
  const turn: OvieSummerTurn = {
    id,
    kind: 'summer-turn',
    conversationId,
    userText,
    state: 'queued',
    eveWorkId: binding.eveWorkId,
    eveAcks: binding.eveAcks,
    createdAt: now,
    updatedAt: now,
  };
  await store.putSummerTurn(turn);
  return turn;
}

export async function listOvieSummerTurnsForLander(
  store: OperatingStore,
  now: Date = new Date()
): Promise<readonly OvieSummerTurn[]> {
  return (await store.listSummerTurns()).filter(
    row =>
      row.state === 'queued' ||
      (row.state === 'claimed' &&
        Date.parse(row.claimExpiresAt ?? '') <= now.getTime())
  );
}

export async function claimOvieSummerTurn(
  store: OperatingStore,
  input: {
    readonly id: string;
    readonly workerId: string;
    readonly now?: Date;
    readonly ttlSeconds?: number;
    readonly claimToken?: string;
  }
): Promise<OvieSummerTurn | undefined> {
  const ttlSeconds = input.ttlSeconds ?? DEFAULT_CLAIM_TTL_SECONDS;
  const now = input.now ?? new Date();
  return store.claimSummerTurn(input.id, {
    workerId: input.workerId,
    claimToken: input.claimToken ?? randomUUID(),
    expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
  });
}

export async function completeOvieSummerTurn(
  store: OperatingStore,
  input: {
    readonly id: string;
    readonly claimToken: string;
    readonly responseText: string;
    readonly tool?: OvieSummerTurn['tool'];
    readonly now?: Date;
  }
): Promise<OvieSummerTurn> {
  const responseText = input.responseText.trim();
  if (!responseText && !input.tool) {
    throw new Error('Summer response is required');
  }
  if (responseText) assertModelMustNotSelfIdentifyAsOvie(responseText);
  if (input.tool && !isSummerSafeTool(input.tool.name)) {
    throw new Error('Summer tool is not on the safe allowlist');
  }
  const next = await store.completeSummerTurn(input.id, {
    claimToken: input.claimToken,
    responseText,
    tool: input.tool,
    completedAt: (input.now ?? new Date()).toISOString(),
  });
  if (!next) throw new OvieSummerTurnError('claim', input.id);
  return next;
}

export async function failOvieSummerTurn(
  store: OperatingStore,
  input: {
    readonly id: string;
    readonly claimToken: string;
    readonly failureCode: string;
    readonly now?: Date;
  }
): Promise<OvieSummerTurn> {
  const failureCode = input.failureCode.trim().slice(0, 160);
  if (!failureCode) throw new Error('Summer failure code is required');
  const next = await store.failSummerTurn(input.id, {
    claimToken: input.claimToken,
    failureCode,
    failedAt: (input.now ?? new Date()).toISOString(),
  });
  if (!next) throw new OvieSummerTurnError('claim', input.id);
  return next;
}

export async function waitForOvieSummerTurn(
  store: OperatingStore,
  input: {
    readonly id: string;
    readonly timeoutMs?: number;
    readonly pollIntervalMs?: number;
    readonly signal?: AbortSignal;
    readonly sleep?: (milliseconds: number) => Promise<void>;
  }
): Promise<OvieSummerTurn | undefined> {
  const deadline = Date.now() + Math.max(0, input.timeoutMs ?? 45_000);
  const sleep =
    input.sleep ??
    ((ms: number) => new Promise(resolve => setTimeout(resolve, ms)));
  let current = await store.getSummerTurn(input.id);
  while (
    current &&
    (current.state === 'queued' || current.state === 'claimed') &&
    Date.now() < deadline &&
    !input.signal?.aborted
  ) {
    await sleep(
      Math.min(input.pollIntervalMs ?? 200, Math.max(0, deadline - Date.now()))
    );
    current = await store.getSummerTurn(input.id);
  }
  return current;
}
