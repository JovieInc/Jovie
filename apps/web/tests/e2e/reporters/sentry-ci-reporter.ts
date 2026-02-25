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

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }

  if (typeof value === 'string') {
    return new Error(value);
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

function isSentryEnabled(): boolean {
  return (
    process.env.SENTRY_E2E_REPORTING === '1' && Boolean(process.env.SENTRY_DSN)
  );
}

class SentryCiReporter implements Reporter {
  private enabled = isSentryEnabled();

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
    if (!this.enabled || result.status !== 'failed') {
      return;
    }

    const error = toError(result.error);
    const location = parseStackLocation(error.stack);

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
        stdout: result.stdout.map(chunk => chunk.toString('utf8')).slice(-5),
        stderr: result.stderr.map(chunk => chunk.toString('utf8')).slice(-5),
      });

      if (location.file !== 'unknown') {
        scope.addEventProcessor(event => ({
          ...event,
          exception: {
            values: [
              {
                type: error.name,
                value: error.message,
                stacktrace: {
                  frames: [
                    {
                      filename: location.file,
                      lineno: location.line,
                      function: test.title,
                    },
                  ],
                },
              },
            ],
          },
        }));
      }

      Sentry.captureException(error);
    });
  }

  async onEnd(result: FullResult): Promise<void> {
    if (!this.enabled) {
      return;
    }

    Sentry.setTag('run.status', result.status);
    await Sentry.flush(FLUSH_TIMEOUT_MS);
    await Sentry.close(FLUSH_TIMEOUT_MS);
  }
}

export default SentryCiReporter;
