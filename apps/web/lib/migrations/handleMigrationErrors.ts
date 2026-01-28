import * as Sentry from '@sentry/nextjs';

type MigrationErrorContext = {
  userId: string;
  operation: string;
};

type MigrationErrorHandlingResult = {
  shouldRetry: boolean;
  fallbackData?: unknown;
  error?: string;
};

const MIGRATION_ERROR_CODES = new Set(['42703', '42P01', '42P02']);

function extractMigrationErrorDetails(error: unknown): {
  code?: string;
  message: string;
} {
  if (error && typeof error === 'object') {
    const errorObject = error as {
      code?: string;
      message?: string;
      cause?: { code?: string; message?: string };
    };

    return {
      code: errorObject.code ?? errorObject.cause?.code,
      message:
        errorObject.message ?? errorObject.cause?.message ?? 'Unknown error',
    };
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  return { message: 'Unknown error' };
}

function isCreatorProfilesColumnMissing(message: string): boolean {
  return (
    message.includes('creator_profiles.') ||
    (message.includes('column') && message.includes('creator_profiles'))
  );
}

function isSocialLinksColumnMissing(message: string): boolean {
  return (
    message.includes('social_links.state') ||
    (message.includes('column') && message.includes('social_links'))
  );
}

function logMigrationWarning(message: string, context: MigrationErrorContext) {
  const { logger } = Sentry;

  logger.warn(message, {
    userId: context.userId,
    operation: context.operation,
  });
}

export function handleMigrationErrors(
  error: unknown,
  context: MigrationErrorContext
): MigrationErrorHandlingResult {
  const { code, message } = extractMigrationErrorDetails(error);
  const hasMigrationErrorCode = code ? MIGRATION_ERROR_CODES.has(code) : false;

  switch (context.operation) {
    case 'creator_profiles': {
      const hasMissingColumn = isCreatorProfilesColumnMissing(message);
      if (hasMigrationErrorCode || hasMissingColumn) {
        logMigrationWarning(
          '[Dashboard] creator_profiles schema migration in progress; treating as needs onboarding',
          context
        );
        return { shouldRetry: false, fallbackData: [] };
      }
      break;
    }
    case 'user_settings': {
      if (hasMigrationErrorCode) {
        logMigrationWarning(
          '[Dashboard] user_settings migration in progress',
          context
        );
        return { shouldRetry: false, fallbackData: undefined };
      }
      break;
    }
    case 'social_links_count': {
      if (hasMigrationErrorCode) {
        logMigrationWarning(
          '[Dashboard] social_links migration in progress',
          context
        );
        return { shouldRetry: false, fallbackData: false };
      }
      if (isSocialLinksColumnMissing(message)) {
        logMigrationWarning(
          '[Dashboard] social_links.state column missing; treating as no links',
          context
        );
        return { shouldRetry: false, fallbackData: false };
      }
      break;
    }
    case 'music_links_count': {
      if (hasMigrationErrorCode) {
        logMigrationWarning(
          '[Dashboard] social_links migration in progress',
          context
        );
        return { shouldRetry: false, fallbackData: false };
      }
      if (isSocialLinksColumnMissing(message)) {
        logMigrationWarning(
          '[Dashboard] social_links.state column missing; treating as no music links',
          context
        );
        return { shouldRetry: false, fallbackData: false };
      }
      break;
    }
    default:
      break;
  }

  return { shouldRetry: true, error: message };
}
