import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  type CertificationRecordBackend,
  mutateCertificationRecord,
  CERTIFICATION_PERSISTENCE_TTL_SECONDS as PERSISTENCE_TTL_SECONDS,
} from './certification-cas';
import {
  type DogfoodJudgeGateDecision,
  type DogfoodJudgeLedgerValue,
  evaluateDogfoodJudgeGate,
  parseDogfoodJudgeLedger,
} from './dogfood-judge-gate';

/**
 * The dogfood-judge ledger (`jovie.dogfood-judge-ledger/v1`) in one
 * `ovie_operating_kv` value, using the same CAS primitive as the Design CI
 * judge ledger. PR #23720's admission gate reads the same value.
 *
 * Tim's rule: no certification passes, no screenshot goes to Tim, no
 * outreach and no user admission unless the judge passes. Every read path
 * here fails closed.
 */

export const DOGFOOD_JUDGE_STORE_KEY =
  'jovie:certification:v1:dogfood-judge' as const;

export class DogfoodJudgePersistenceError extends Error {}

function parseOrThrow(raw: unknown): DogfoodJudgeLedgerValue {
  const ledger = parseDogfoodJudgeLedger(raw);
  if (!ledger) {
    throw new DogfoodJudgePersistenceError(
      'Dogfood judge ledger is malformed or has an unexpected schema.'
    );
  }
  return ledger;
}

/** HMAC-SHA256(key, digest), hex. */
export function signDogfoodJudgeDigest(key: string, digest: string): string {
  return createHmac('sha256', key).update(digest).digest('hex');
}

export function verifyDogfoodJudgeSignature(input: {
  readonly key: string | undefined;
  readonly digest: string;
  readonly signature: { readonly alg: string; readonly value: string } | null;
}): boolean {
  if (!input.key || !input.signature) return false;
  if (input.signature.alg !== 'hmac-sha256') return false;
  const expected = Buffer.from(
    signDogfoodJudgeDigest(input.key, input.digest),
    'utf8'
  );
  const actual = Buffer.from(input.signature.value, 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export class DogfoodJudgeLedger {
  constructor(private readonly backend: CertificationRecordBackend) {}

  /**
   * CAS-replaces the stored ledger with a publisher-built one. A ledger
   * published before the stored one never replaces it.
   */
  async replace(
    next: DogfoodJudgeLedgerValue
  ): Promise<{ readonly written: boolean }> {
    const publishedMs = (ledger: DogfoodJudgeLedgerValue) =>
      Date.parse(String(ledger.publishedAt ?? '')) || 0;
    return mutateCertificationRecord<
      DogfoodJudgeLedgerValue,
      { readonly written: boolean }
    >({
      backend: this.backend,
      key: DOGFOOD_JUDGE_STORE_KEY,
      initialize: async () => {
        await this.backend.setIfAbsent(
          DOGFOOD_JUDGE_STORE_KEY,
          JSON.stringify(next),
          PERSISTENCE_TTL_SECONDS
        );
        return next;
      },
      parse: parseOrThrow,
      validate: () => {
        /* parseOrThrow already threw on anything malformed. */
      },
      update: current =>
        publishedMs(current) > publishedMs(next)
          ? { ledger: current, result: { written: false } }
          : { ledger: next, result: { written: true } },
      error: message => new DogfoodJudgePersistenceError(message),
    });
  }

  async read(): Promise<DogfoodJudgeLedgerValue | null> {
    const raw = await this.backend.get(DOGFOOD_JUDGE_STORE_KEY);
    if (raw === null || raw === undefined) return null;
    return parseOrThrow(raw);
  }
}

/**
 * Fail-closed gate lookup: an unreadable or malformed ledger denies, so a
 * ledger outage admits nobody.
 */
export async function checkDogfoodJudgeGate(
  ledger: Pick<DogfoodJudgeLedger, 'read'>,
  surfaceId: string,
  options: { now?: Date; maxAgeDays?: number; prodSha?: string | null } = {}
): Promise<DogfoodJudgeGateDecision> {
  try {
    return evaluateDogfoodJudgeGate(await ledger.read(), surfaceId, {
      now: options.now ?? new Date(),
      maxAgeDays: options.maxAgeDays,
      prodSha: options.prodSha,
    });
  } catch (error) {
    return {
      allow: false,
      reasons: [
        `ledger-unreadable (${error instanceof Error ? error.message : 'unknown'})`,
      ],
    };
  }
}
