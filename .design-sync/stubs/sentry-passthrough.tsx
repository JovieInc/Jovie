// design-sync stub: replaces @sentry/react, @sentry/browser, @sentry/nextjs
// with no-ops for browser bundles.
//
// The marketing tree doesn't call Sentry directly, but transitive dependencies
// may pull in Sentry browser SDK code that references Node.js globals. This
// stub silences those imports so the design-sync bundle stays browser-clean.
//
// ErrorBoundary becomes a transparent fragment so any wrapping usage still
// renders its children in the preview sandbox.
import * as React from 'react';

// Core no-op SDK surface
export function init(_options?: unknown): void {}
export function captureException(_error: unknown, _context?: unknown): string {
  return '';
}
export function captureMessage(_message: string, _level?: unknown): string {
  return '';
}
export function captureEvent(_event: unknown): string {
  return '';
}
export function addBreadcrumb(_breadcrumb: unknown): void {}
export function setUser(_user: unknown): void {}
export function setTag(_key: string, _value: unknown): void {}
export function setContext(_name: string, _context: unknown): void {}
export function setExtra(_key: string, _value: unknown): void {}
export function configureScope(_callback: unknown): void {}
export function withScope(_callback: unknown): void {}
export function startTransaction(_context: unknown): object {
  return {};
}
export function flush(_timeout?: number): Promise<boolean> {
  return Promise.resolve(true);
}
export function close(_timeout?: number): Promise<boolean> {
  return Promise.resolve(true);
}
export function getCurrentHub(): object {
  return { configureScope() {}, captureException() {} };
}
export function getClient(): undefined {
  return undefined;
}
export function lastEventId(): string | undefined {
  return undefined;
}
export function showReportDialog(_options?: unknown): void {}
// Next.js / router instrumentation hooks (used by client-lite.ts, client-full.ts)
export const captureRouterTransitionStart: undefined = undefined;

// React-specific
interface ErrorBoundaryProps {
  readonly children?: React.ReactNode;
  readonly fallback?: React.ReactNode;
  readonly onError?: (error: Error, info: React.ErrorInfo) => void;
}
export function ErrorBoundary({ children }: ErrorBoundaryProps) {
  return <>{children}</>;
}
export function withErrorBoundary<P extends object>(
  component: React.ComponentType<P>,
  _options?: unknown
): React.ComponentType<P> {
  return component;
}
export function withProfiler<P extends object>(
  component: React.ComponentType<P>,
  _options?: unknown
): React.ComponentType<P> {
  return component;
}
export function Profiler({
  children,
}: {
  readonly children?: React.ReactNode;
}) {
  return <>{children}</>;
}

// Next.js-specific wrappers
export function withSentryConfig(config: unknown): unknown {
  return config;
}
export function captureUnderscoreErrorException(
  _error: unknown
): Promise<void> {
  return Promise.resolve();
}

// Default export (some imports use `import Sentry from '@sentry/nextjs'`)
export default {
  init,
  captureException,
  captureMessage,
  captureEvent,
  addBreadcrumb,
  setUser,
  setTag,
  setContext,
  setExtra,
  withScope,
  startTransaction,
  flush,
  close,
  getCurrentHub,
};
