import * as Sentry from '@sentry/nextjs';
import { captureError, captureWarning } from '@/lib/error-tracking';

const PREFIX = '[OutreachPipeline]';

type LogData = Record<string, unknown>;

/**
 * Structured info log for the outreach pipeline.
 * Writes to console and adds a Sentry breadcrumb for traceability.
 */
export function pipelineLog(
  stage: string,
  message: string,
  data?: LogData
): void {
  const payload = data ? ` ${JSON.stringify(data)}` : '';
  console.log(`${PREFIX}[${stage}] ${message}${payload}`);

  // Add Sentry breadcrumb so info logs appear in error traces
  Sentry.addBreadcrumb({
    category: `pipeline.${stage}`,
    message,
    level: 'info',
    data,
  });
}

/**
 * Structured warning — writes to console + sends to Sentry/PostHog.
 */
export function pipelineWarn(
  stage: string,
  message: string,
  data?: LogData
): void {
  const fullMessage = `${PREFIX}[${stage}] ${message}`;
  console.warn(fullMessage, data ?? '');

  Sentry.addBreadcrumb({
    category: `pipeline.${stage}`,
    message,
    level: 'warning',
    data,
  });

  captureWarning(fullMessage, undefined, {
    route: `leads/${stage}`,
    ...data,
  });
}

/**
 * Structured error — writes to console + sends to Sentry/PostHog.
 */
export async function pipelineError(
  stage: string,
  message: string,
  error: unknown,
  data?: LogData
): Promise<void> {
  const fullMessage = `${PREFIX}[${stage}] ${message}`;
  await captureError(fullMessage, error, {
    route: `leads/${stage}`,
    ...data,
  });
}
