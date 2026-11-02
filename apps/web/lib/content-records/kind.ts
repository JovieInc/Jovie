import type { z } from 'zod';

/**
 * A content kind is one schema-validated shape that ships as data instead of
 * code (`.claude/rules/data-vs-code.md`). Every kind reuses the same store,
 * preview, publish, audit log, and rollback in `store.server.ts`; a kind only
 * declares what is valid and what to refresh when its live version moves.
 */
export interface ContentKindDefinition<T> {
  /** Stable id, stored in the `kind` column. Lowercase slug. */
  readonly kind: string;
  /** Bumped on a breaking schema change; stored with every version. */
  readonly schemaVersion: number;
  /** Write-time and read-time validation. */
  readonly schema: z.ZodType<T>;
  /** Record keys this kind serves. A publish to any other key is rejected. */
  readonly keys: readonly string[];
  /**
   * Repo-seeded default per key. Served when no version is live or the store
   * is unavailable, so an outage degrades to the code default, never to an
   * empty page.
   */
  readonly defaultRecord: (key: string) => T;
  /**
   * Cross-record rules a schema cannot express (registry membership, locked
   * fields, legal guards). Returns human-readable violations; empty = valid.
   */
  readonly validate?: (data: T, key: string) => readonly string[];
  /**
   * Render smoke test, run on draft and on the API dry run (not on reads).
   * Renders the record through its real renderer and returns problems; a
   * record that throws or drops content cannot be stored.
   */
  readonly smoke?: (data: T, key: string) => readonly string[];
  /** Paths to revalidate after the live pointer moves for `key`. */
  readonly livePaths: (key: string) => readonly string[];
  /**
   * false: drafts and publishes come only from the kind's own producer (a
   * measured value must not be typed in through the API). History and
   * rollback stay available. Default true.
   */
  readonly apiWritable?: boolean;
}

export type AnyContentKind = ContentKindDefinition<unknown>;

export function contentRecordCacheTag(kind: string, key: string): string {
  return `content-record:${kind}:${key}`;
}

export type ContentValidationResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly errors: readonly string[] };

/** Schema plus cross-record validation. Pure; safe on client and server. */
export function validateContentRecord<T>(
  definition: ContentKindDefinition<T>,
  key: string,
  input: unknown
): ContentValidationResult<T> {
  if (!definition.keys.includes(key)) {
    return {
      ok: false,
      errors: [`Unknown ${definition.kind} key: ${key}`],
    };
  }
  const parsed = definition.schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(
        issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`
      ),
    };
  }
  const errors = definition.validate?.(parsed.data, key) ?? [];
  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, data: parsed.data };
}

/** Publish gate: schema + cross-record rules + the kind's render smoke test. */
export function gateContentRecord<T>(
  definition: ContentKindDefinition<T>,
  key: string,
  input: unknown
): ContentValidationResult<T> {
  const validated = validateContentRecord(definition, key, input);
  if (!validated.ok || !definition.smoke) return validated;
  let errors: readonly string[];
  try {
    errors = definition.smoke(validated.data, key);
  } catch (error) {
    errors = [
      `render smoke test threw: ${error instanceof Error ? error.message : String(error)}`,
    ];
  }
  return errors.length > 0 ? { ok: false, errors } : validated;
}
