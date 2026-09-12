/**
 * Bounded Linear create/update for Summer (governor path).
 *
 * Distinct from delivery acceptance and from Symphony execution completion.
 * Every mutation requires explicit founder intent + provenance and must
 * read back the durable issue identity before claiming success.
 */

export const LINEAR_COORDINATION_SCHEMA =
  'jovie.summer.linear-coordination/v1' as const;

export type LinearCoordinationAction = 'create' | 'update';

export type LinearCoordinationRequest = {
  readonly action: LinearCoordinationAction;
  readonly title: string;
  readonly body: string;
  readonly teamId: string;
  readonly issueId?: string;
  readonly founderIntentRef: string;
  readonly sourceRefs: readonly string[];
  readonly author: string;
};

export type LinearCoordinationReceipt = {
  readonly schema: typeof LINEAR_COORDINATION_SCHEMA;
  readonly action: LinearCoordinationAction;
  readonly issueId: string;
  readonly identifier: string;
  readonly url: string;
  readonly title: string;
  readonly founderIntentRef: string;
  readonly sourceRefs: readonly string[];
  readonly author: string;
  readonly readBackAt: string;
  readonly executionCompleted: false;
  readonly deliveryAccepted: false;
};

export type LinearCoordinationResult =
  | { readonly status: 'ok'; readonly receipt: LinearCoordinationReceipt }
  | {
      readonly status: 'denied';
      readonly code:
        | 'missing-founder-intent'
        | 'missing-provenance'
        | 'missing-team'
        | 'missing-issue-id'
        | 'capability-denied'
        | 'readback-mismatch';
      readonly message: string;
    }
  | {
      readonly status: 'failed';
      readonly code: 'provider-error' | 'readback-missing';
      readonly message: string;
    };

export class LinearCoordinationDeniedError extends Error {
  constructor(
    readonly code: Extract<
      LinearCoordinationResult,
      { status: 'denied' }
    >['code'],
    message: string
  ) {
    super(message);
    this.name = 'LinearCoordinationDeniedError';
  }
}

export type LinearIssueSnapshot = {
  readonly id: string;
  readonly identifier: string;
  readonly title: string;
  readonly url: string;
};

export type LinearCoordinationDeps = {
  readonly createIssue: (input: {
    readonly title: string;
    readonly description: string;
    readonly teamId: string;
  }) => Promise<LinearIssueSnapshot>;
  readonly updateIssue: (input: {
    readonly issueId: string;
    readonly title: string;
    readonly description: string;
  }) => Promise<LinearIssueSnapshot>;
  readonly readIssue: (issueId: string) => Promise<LinearIssueSnapshot | null>;
  readonly now?: () => string;
};

function assertRequest(input: LinearCoordinationRequest): void {
  if (!input.founderIntentRef.trim()) {
    throw new LinearCoordinationDeniedError(
      'missing-founder-intent',
      'Bounded Linear mutation requires an explicit founderIntentRef'
    );
  }
  if (
    input.sourceRefs.map(r => r.trim()).filter(Boolean).length === 0 ||
    !input.author.trim() ||
    !input.title.trim() ||
    !input.body.trim()
  ) {
    throw new LinearCoordinationDeniedError(
      'missing-provenance',
      'title, body, author, and sourceRefs are required'
    );
  }
  if (!input.teamId.trim() && input.action === 'create') {
    throw new LinearCoordinationDeniedError(
      'missing-team',
      'create requires teamId'
    );
  }
  if (input.action === 'update' && !input.issueId?.trim()) {
    throw new LinearCoordinationDeniedError(
      'missing-issue-id',
      'update requires issueId'
    );
  }
}

/**
 * Create or update a Linear issue, then read it back.
 * Success requires readback identity match. Never sets executionCompleted
 * or deliveryAccepted.
 */
export async function coordinateLinearWork(
  input: LinearCoordinationRequest,
  deps: LinearCoordinationDeps
): Promise<LinearCoordinationResult> {
  try {
    assertRequest(input);
  } catch (error) {
    if (error instanceof LinearCoordinationDeniedError) {
      return { status: 'denied', code: error.code, message: error.message };
    }
    throw error;
  }

  let mutated: LinearIssueSnapshot;
  try {
    if (input.action === 'create') {
      mutated = await deps.createIssue({
        title: input.title.trim(),
        description: input.body.trim(),
        teamId: input.teamId.trim(),
      });
    } else {
      mutated = await deps.updateIssue({
        issueId: input.issueId!.trim(),
        title: input.title.trim(),
        description: input.body.trim(),
      });
    }
  } catch (error) {
    return {
      status: 'failed',
      code: 'provider-error',
      message: error instanceof Error ? error.message : 'Linear provider error',
    };
  }

  const readBack = await deps.readIssue(mutated.id);
  if (!readBack) {
    return {
      status: 'failed',
      code: 'readback-missing',
      message: 'Linear mutation succeeded but readback returned no issue',
    };
  }
  if (
    readBack.id !== mutated.id ||
    readBack.identifier !== mutated.identifier
  ) {
    return {
      status: 'denied',
      code: 'readback-mismatch',
      message: 'Linear readback identity does not match mutation result',
    };
  }

  return {
    status: 'ok',
    receipt: {
      schema: LINEAR_COORDINATION_SCHEMA,
      action: input.action,
      issueId: readBack.id,
      identifier: readBack.identifier,
      url: readBack.url,
      title: readBack.title,
      founderIntentRef: input.founderIntentRef.trim(),
      sourceRefs: input.sourceRefs.map(r => r.trim()).filter(Boolean),
      author: input.author.trim(),
      readBackAt: deps.now?.() ?? new Date().toISOString(),
      executionCompleted: false,
      deliveryAccepted: false,
    },
  };
}
