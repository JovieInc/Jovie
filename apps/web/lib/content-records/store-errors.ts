export class ContentValidationError extends Error {
  constructor(readonly errors: readonly string[]) {
    super(`Content record failed validation: ${errors.join('; ')}`);
    this.name = 'ContentValidationError';
  }
}

export class ContentConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentConflictError';
  }
}

export class ContentAuthorizationError extends Error {
  constructor(
    readonly status: 401 | 403 | 503,
    message: string
  ) {
    super(message);
    this.name = 'ContentAuthorizationError';
  }
}

export class ContentPublicationUncertainError extends Error {
  constructor(readonly operationId: string) {
    super(
      'Publication outcome is uncertain; reconcile this operation before retrying'
    );
    this.name = 'ContentPublicationUncertainError';
  }
}
