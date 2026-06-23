export type ObservabilityPlatform = 'ios' | 'web' | 'electron';
export type ObservabilityKind = 'crash' | 'hang' | 'hitch' | 'launch' | 'error';

export interface ObservabilityReport {
  readonly platform: ObservabilityPlatform;
  readonly kind: ObservabilityKind;
  readonly title: string;
  readonly message?: string;
  readonly release: string;
  readonly environment?: string;
  readonly stacktrace?: string;
  readonly occurred_at?: string;
  readonly metadata?: Record<string, string>;
}

const PLATFORMS = new Set<ObservabilityPlatform>(['ios', 'web', 'electron']);
const KINDS = new Set<ObservabilityKind>([
  'crash',
  'hang',
  'hitch',
  'launch',
  'error',
]);

export function parseObservabilityReport(
  value: unknown
): ObservabilityReport | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const platform = record.platform;
  const kind = record.kind;
  const title = record.title;
  const release = record.release;

  if (
    typeof platform !== 'string' ||
    !PLATFORMS.has(platform as ObservabilityPlatform) ||
    typeof kind !== 'string' ||
    !KINDS.has(kind as ObservabilityKind) ||
    typeof title !== 'string' ||
    title.trim().length === 0 ||
    typeof release !== 'string' ||
    release.trim().length === 0
  ) {
    return null;
  }

  const message =
    typeof record.message === 'string' ? record.message : undefined;
  const environment =
    typeof record.environment === 'string' ? record.environment : undefined;
  const stacktrace =
    typeof record.stacktrace === 'string' ? record.stacktrace : undefined;
  const occurred_at =
    typeof record.occurred_at === 'string' ? record.occurred_at : undefined;

  const metadata =
    record.metadata && typeof record.metadata === 'object'
      ? Object.fromEntries(
          Object.entries(record.metadata as Record<string, unknown>).filter(
            ([, entry]) => typeof entry === 'string'
          )
        )
      : undefined;

  return {
    platform: platform as ObservabilityPlatform,
    kind: kind as ObservabilityKind,
    title: title.trim(),
    message,
    release: release.trim(),
    environment,
    stacktrace,
    occurred_at,
    metadata,
  };
}
