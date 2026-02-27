import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import * as Sentry from '@sentry/node';

const FLUSH_TIMEOUT_MS = 4000;

const SECRET_PATTERN =
  /(?:token|key|secret|password|authorization|cookie|dsn|credential)[=: ].{4,}/gi;

function redactSecrets(text: string): string {
  return text.replace(SECRET_PATTERN, match => {
    const prefix = match.slice(
      0,
      match.indexOf('=') + 1 || match.indexOf(':') + 1 || match.indexOf(' ') + 1
    );
    return `${prefix}[REDACTED]`;
  });
}

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }

  if (typeof value === 'string') {
    return new Error(value);
  }

  // Playwright's TestError is a plain object with message/stack/value properties
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const msg =
      typeof obj.message === 'string' && obj.message
        ? obj.message
        : typeof obj.value === 'string' && obj.value
          ? obj.value
          : 'Playwright test failed';
    const err = new Error(msg);
    if (typeof obj.stack === 'string') {
      err.stack = obj.stack;
    }
    return err;
  }

  return new Error('Playwright test failed with an unknown error payload.');
}

function parseStackLocation(stack?: string): { file: string; line?: number } {
  if (!stack) {
    return { file: 'unknown' };
  }

  const firstFrame = stack
    .split('\n')
    .map(line => line.trim())
    .find(line => line.startsWith('at '));

  if (!firstFrame) {
    return { file: 'unknown' };
  }

  const match = /\(?([^()]+):(\d+):(\d+)\)?$/.exec(firstFrame);

  if (!match) {
    return { file: 'unknown' };
  }

  return {
    file: match[1],
    line: Number(match[2]),
  };
}

function isE2eSentryReportingEnabled(): boolean {
  return (
    process.env.SENTRY_E2E_REPORTING === '1' && Boolean(process.env.SENTRY_DSN)
  );
}

class SentryCiReporter implements Reporter {
  private enabled = isE2eSentryReportingEnabled();

  onBegin(config: FullConfig, suite: Suite): void {
    if (!this.enabled) {
      return;
    }

    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.SENTRY_ENVIRONMENT ?? 'ci-e2e',
      release: process.env.SENTRY_RELEASE,
      tracesSampleRate: 0,
      sendDefaultPii: false,
      maxBreadcrumbs: 100,
      initialScope: {
        tags: {
          source: 'playwright-ci',
        },
        extra: {
          totalTests: suite.allTests().length,
          workers: config.workers,
        },
      },
    });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    // Only report on the final retry attempt to avoid noise from transient failures
    if (
      !this.enabled ||
      result.status !== 'failed' ||
      result.retry < test.retries
    ) {
      return;
    }

    // Parse stack from the original TestError before toError conversion
    const location = parseStackLocation(result.error?.stack);
    const error = toError(result.error);

    Sentry.withScope(scope => {
      scope.setLevel('error');
      scope.setTag('test.project', test.parent.project()?.name ?? 'unknown');
      scope.setTag('test.status', result.status);
      scope.setTag('test.retry', String(result.retry));
      scope.setTag('test.expectedStatus', test.expectedStatus);
      scope.setTag('ci', process.env.CI ? 'true' : 'false');

      scope.setContext('playwright.test', {
        id: test.id,
        title: test.title,
        titlePath: test.titlePath(),
        file: test.location.file,
        line: test.location.line,
        column: test.location.column,
        timeout: test.timeout,
        durationMs: result.duration,
      });

      scope.setContext('playwright.failure', {
        workerIndex: result.workerIndex,
        parallelIndex: result.parallelIndex,
        stdout: result.stdout
          .map(chunk =>
            redactSecrets(
              Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk
            )
          )
          .slice(-5),
        stderr: result.stderr
          .map(chunk =>
            redactSecrets(
              Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk
            )
          )
          .slice(-5),
      });

      if (location.file !== 'unknown') {
        scope.addEventProcessor(event => {
          const exception = event.exception;

          if (
            !exception ||
            !Array.isArray(exception.values) ||
            exception.values.length === 0
          ) {
            return event;
          }

          const [firstException, ...restExceptions] = exception.values;
          const existingFrames = firstException.stacktrace?.frames ?? [];
          const augmentedFirstException = {
            ...firstException,
            stacktrace: {
              ...firstException.stacktrace,
              frames: [
                ...existingFrames,
                {
                  filename: location.file,
                  lineno: location.line,
                  function: test.title,
                },
              ],
            },
          };

          return {
            ...event,
            exception: {
              ...exception,
              values: [augmentedFirstException, ...restExceptions],
            },
          };
        });
      }

      Sentry.captureException(error);
    });
  }

  async onEnd(result: FullResult): Promise<void> {
    if (!this.enabled) {
      return;
    }

    Sentry.setTag('run.status', result.status);
    await Sentry.close(FLUSH_TIMEOUT_MS);
  }
}

export default SentryCiReporter;
