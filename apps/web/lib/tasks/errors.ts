export class TaskMutationConflictError extends Error {
  readonly code = 'CONFLICT';

  constructor(message = 'Task changed in another session') {
    super(message);
    this.name = 'TaskMutationConflictError';
  }
}

export class TaskMutationValidationError extends Error {
  readonly code = 'VALIDATION_FAILED';

  constructor(message: string) {
    super(message);
    this.name = 'TaskMutationValidationError';
  }
}

export class TaskMutationAccessError extends Error {
  readonly code = 'FORBIDDEN';

  constructor(message = 'Task not found or access denied') {
    super(message);
    this.name = 'TaskMutationAccessError';
  }
}
