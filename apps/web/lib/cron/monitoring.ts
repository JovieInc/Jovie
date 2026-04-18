import * as Sentry from '@sentry/nextjs';

export interface CronMonitorDefinition {
  readonly slug: string;
  readonly schedule: string;
  readonly maxRuntime: number;
  readonly checkinMargin?: number;
  readonly failureIssueThreshold?: number;
  readonly recoveryThreshold?: number;
}

interface RunMonitoredCronOptions<T> {
  readonly monitor: CronMonitorDefinition;
  readonly shouldFailResult?: (result: T) => boolean;
}

export async function runMonitoredCron<T>(
  options: RunMonitoredCronOptions<T>,
  callback: () => Promise<T>
): Promise<T> {
  const monitorConfig = {
    schedule: {
      type: 'crontab' as const,
      value: options.monitor.schedule,
    },
    maxRuntime: options.monitor.maxRuntime,
    checkinMargin: options.monitor.checkinMargin,
    timezone: 'UTC',
    failureIssueThreshold: options.monitor.failureIssueThreshold ?? 2,
    recoveryThreshold: options.monitor.recoveryThreshold ?? 1,
    isolateTrace: true,
  };

  const startedAt = Date.now();
  const checkInId = Sentry.captureCheckIn(
    { monitorSlug: options.monitor.slug, status: 'in_progress' },
    monitorConfig
  );

  try {
    const result = await callback();
    const failed = options.shouldFailResult?.(result) ?? false;

    Sentry.captureCheckIn(
      {
        monitorSlug: options.monitor.slug,
        status: failed ? 'error' : 'ok',
        checkInId,
        duration: (Date.now() - startedAt) / 1000,
      },
      monitorConfig
    );

    return result;
  } catch (error) {
    Sentry.captureCheckIn(
      {
        monitorSlug: options.monitor.slug,
        status: 'error',
        checkInId,
        duration: (Date.now() - startedAt) / 1000,
      },
      monitorConfig
    );
    throw error;
  }
}
