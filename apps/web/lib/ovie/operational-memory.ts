/**
 * Summer scoped operational-memory writes (bounded operator).
 *
 * Distinct from privileged-gbrain-write: Summer may append evidence-backed
 * operational records under ops/summer/* with provenance. Authority, policy,
 * and self-grant pages stay denied. Knowledge write is not work acceptance.
 */

export const OPERATIONAL_MEMORY_SCHEMA =
  'jovie.summer.operational-memory/v1' as const;

export const OPERATIONAL_MEMORY_KINDS = [
  'observed',
  'inference',
  'proposal',
  'approved-decision',
] as const;

export type OperationalMemoryKind =
  (typeof OPERATIONAL_MEMORY_KINDS)[number];

export const OPERATIONAL_MEMORY_SLUG_PREFIX = 'ops/summer/' as const;

const DENIED_SLUG_PREFIXES = [
  'authority/',
  'policy/',
  'canon/invariants',
  'agent-org-chart',
  'permissions/',
  'summer/authority',
  'summer/permissions',
] as const;

export type OperationalMemoryRecord = {
  readonly schema: typeof OPERATIONAL_MEMORY_SCHEMA;
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly body: string;
  readonly kind: OperationalMemoryKind;
  readonly sourceRefs: readonly string[];
  readonly observedAt: string;
  readonly author: string;
  readonly supersedes?: string;
  readonly createdAt: string;
};

export type OperationalMemoryInput = {
  readonly slug: string;
  readonly title: string;
  readonly body: string;
  readonly kind: OperationalMemoryKind;
  readonly sourceRefs: readonly string[];
  readonly observedAt: string;
  readonly author: string;
  readonly supersedes?: string;
  readonly id?: string;
  readonly createdAt?: string;
};

export type OperationalMemoryCommitResult =
  | {
      readonly status: 'written';
      readonly record: OperationalMemoryRecord;
      readonly gbrainSlug: string;
    }
  | {
      readonly status: 'buffered';
      readonly record: OperationalMemoryRecord;
      readonly bufferId: string;
      readonly reason: string;
    }
  | {
      readonly status: 'denied';
      readonly code:
        | 'authority-or-policy-slug'
        | 'invalid-slug-namespace'
        | 'missing-provenance'
        | 'invalid-kind'
        | 'capability-denied';
      readonly message: string;
    };

export class OperationalMemoryDeniedError extends Error {
  constructor(
    readonly code: Exclude<
      OperationalMemoryCommitResult,
      { status: 'written' | 'buffered' }
    >['code'],
    message: string
  ) {
    super(message);
    this.name = 'OperationalMemoryDeniedError';
  }
}

export function isOperationalMemoryKind(
  value: unknown
): value is OperationalMemoryKind {
  return (
    typeof value === 'string' &&
    (OPERATIONAL_MEMORY_KINDS as readonly string[]).includes(value)
  );
}

export function isDeniedOperationalMemorySlug(slug: string): boolean {
  const normalized = slug.trim().toLowerCase();
  return DENIED_SLUG_PREFIXES.some(
    prefix =>
      normalized === prefix.replace(/\/$/, '') ||
      normalized.startsWith(prefix)
  );
}

export function assertOperationalMemorySlugAllowed(slug: string): void {
  const trimmed = slug.trim();
  if (!trimmed.startsWith(OPERATIONAL_MEMORY_SLUG_PREFIX)) {
    throw new OperationalMemoryDeniedError(
      'invalid-slug-namespace',
      `Operational memory slug namespace must use ${OPERATIONAL_MEMORY_SLUG_PREFIX}*`
    );
  }
  if (isDeniedOperationalMemorySlug(trimmed)) {
    throw new OperationalMemoryDeniedError(
      'authority-or-policy-slug',
      'Summer cannot write authority, policy, or self-grant pages'
    );
  }
}

export function buildOperationalMemoryRecord(
  input: OperationalMemoryInput
): OperationalMemoryRecord {
  const slug = input.slug.trim();
  assertOperationalMemorySlugAllowed(slug);

  if (!isOperationalMemoryKind(input.kind)) {
    throw new OperationalMemoryDeniedError(
      'invalid-kind',
      'kind must be observed, inference, proposal, or approved-decision'
    );
  }

  const sourceRefs = input.sourceRefs
    .map(ref => ref.trim())
    .filter(ref => ref.length > 0);
  const observedAt = input.observedAt.trim();
  const author = input.author.trim();
  const title = input.title.trim();
  const body = input.body.trim();

  if (
    sourceRefs.length === 0 ||
    !observedAt ||
    !author ||
    !title ||
    !body
  ) {
    throw new OperationalMemoryDeniedError(
      'missing-provenance',
      'sourceRefs, observedAt, author, title, and body are required'
    );
  }

  const createdAt = input.createdAt?.trim() || new Date().toISOString();
  const id =
    input.id?.trim() ||
    `opsmem_${createdAt.replace(/[^0-9A-Za-z]/g, '').slice(0, 20)}_${Math.random().toString(36).slice(2, 10)}`;

  return {
    schema: OPERATIONAL_MEMORY_SCHEMA,
    id,
    slug,
    title,
    body,
    kind: input.kind,
    sourceRefs,
    observedAt,
    author,
    ...(input.supersedes?.trim()
      ? { supersedes: input.supersedes.trim() }
      : {}),
    createdAt,
  };
}

export function renderOperationalMemoryPage(
  record: OperationalMemoryRecord
): string {
  return [
    `# ${record.title}`,
    '',
    `schema: ${record.schema}`,
    `id: ${record.id}`,
    `kind: ${record.kind}`,
    `author: ${record.author}`,
    `observedAt: ${record.observedAt}`,
    `createdAt: ${record.createdAt}`,
    `sourceRefs: ${record.sourceRefs.join(', ')}`,
    ...(record.supersedes ? [`supersedes: ${record.supersedes}`] : []),
    '',
    '## Record',
    '',
    record.body,
    '',
    '## Provenance note',
    '',
    'This is a Summer operational-memory record. It is not Linear work acceptance,',
    'not an execution receipt, and not an authority or permission change.',
  ].join('\n');
}

export type OperationalMemoryDeps = {
  readonly writeGbrainPage: (input: {
    readonly slug: string;
    readonly title: string;
    readonly body: string;
  }) => Promise<{ ok: true } | { ok: false; reason: string }>;
  readonly bufferRecord: (
    record: OperationalMemoryRecord
  ) => Promise<{ bufferId: string }>;
};

/**
 * Write to GBrain when available; otherwise buffer durably.
 * Never claims a GBrain write on the buffer path. Corrections use supersedes.
 */
export async function commitOperationalMemory(
  input: OperationalMemoryInput,
  deps: OperationalMemoryDeps
): Promise<OperationalMemoryCommitResult> {
  let record: OperationalMemoryRecord;
  try {
    record = buildOperationalMemoryRecord(input);
  } catch (error) {
    if (error instanceof OperationalMemoryDeniedError) {
      return {
        status: 'denied',
        code: error.code,
        message: error.message,
      };
    }
    throw error;
  }

  const write = await deps.writeGbrainPage({
    slug: record.slug,
    title: record.title,
    body: renderOperationalMemoryPage(record),
  });

  if (write.ok) {
    return {
      status: 'written',
      record,
      gbrainSlug: record.slug,
    };
  }

  const { bufferId } = await deps.bufferRecord(record);
  return {
    status: 'buffered',
    record,
    bufferId,
    reason: write.reason,
  };
}
