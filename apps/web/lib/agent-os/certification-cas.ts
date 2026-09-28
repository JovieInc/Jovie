/** Shared persistence mechanics for the two certification domain adapters. */
export interface CertificationRecordBackend {
  get(key: string): Promise<unknown>;
  setIfAbsent(
    key: string,
    value: unknown,
    ttlSeconds: number
  ): Promise<boolean>;
  compareAndSet(
    key: string,
    expectedValue: string,
    nextValue: string,
    ttlSeconds: number
  ): Promise<boolean>;
}

export const CERTIFICATION_PERSISTENCE_TTL_SECONDS = 315_576_000;
export const CERTIFICATION_CAS_ATTEMPTS = 5;

/**
 * The ledger is stored as one JSON string in a jsonb column, but the driver
 * decodes that jsonb string and Drizzle's jsonb mapper parses it again, so a
 * read can hand back the object. The stored string was itself produced by
 * JSON.stringify, so re-serializing yields the identical compare-and-set
 * value (verified on production, 2026-09-28: every ingest was rejected).
 */
export function certificationRecordJson(raw: unknown): string | null {
  if (typeof raw === 'string') return raw;
  if (raw !== null && typeof raw === 'object') return JSON.stringify(raw);
  return null;
}

/** Updates must be pure: a lost CAS reruns them against the latest persisted state. */
export async function mutateCertificationRecord<State, Result>(input: {
  backend: CertificationRecordBackend;
  key: string;
  initialize: () => Promise<unknown>;
  parse: (raw: unknown) => State;
  validate: (state: State) => void;
  update: (state: State) => { readonly ledger: State; readonly result: Result };
  error: (message: string) => Error;
}): Promise<Result> {
  for (let attempt = 0; attempt < CERTIFICATION_CAS_ATTEMPTS; attempt += 1) {
    const raw = await input.backend.get(input.key);
    if (raw === null || raw === undefined) {
      await input.initialize();
      continue;
    }
    const json = certificationRecordJson(raw);
    if (json === null) {
      throw input.error(
        'Certification ledger must be stored as one compare-and-set JSON string.'
      );
    }
    const current = input.parse(json);
    input.validate(current);
    const next = input.update(current);
    if (next.ledger === current) return next.result;
    const serialized = JSON.stringify(next.ledger);
    input.validate(input.parse(serialized));
    if (
      await input.backend.compareAndSet(
        input.key,
        json,
        serialized,
        CERTIFICATION_PERSISTENCE_TTL_SECONDS
      )
    ) {
      return next.result;
    }
  }
  throw input.error(
    'Certification ledger update lost compare-and-set repeatedly.'
  );
}
