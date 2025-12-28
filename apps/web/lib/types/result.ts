/**
 * Generic Result type for operations that can fail.
 * Inspired by Rust's Result<T, E> pattern.
 *
 * This type enables explicit error handling without throwing exceptions,
 * making error paths more visible and type-safe.
 */

import type { AppError } from '@/lib/errors';

/**
 * Result type representing either a successful value or an error.
 */
export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Creates a successful Result.
 */
export function success<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * Creates a failed Result.
 */
export function failure<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * Type guard to check if a Result is successful.
 */
export function isSuccess<T, E>(
  result: Result<T, E>
): result is { ok: true; value: T } {
  return result.ok === true;
}

/**
 * Type guard to check if a Result is a failure.
 */
export function isFailure<T, E>(
  result: Result<T, E>
): result is { ok: false; error: E } {
  return result.ok === false;
}

/**
 * Unwraps a Result, returning the value or throwing the error.
 * Use this when you're confident the Result is successful.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw result.error;
}

/**
 * Unwraps a Result, returning the value or a default value if it failed.
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return result.ok ? result.value : defaultValue;
}

/**
 * Maps the value of a successful Result to a new value.
 * If the Result is a failure, returns the error unchanged.
 */
export function map<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> {
  return result.ok ? success(fn(result.value)) : result;
}

/**
 * Asynchronously maps the value of a successful Result to a new value.
 * If the Result is a failure, returns the error unchanged.
 */
export async function mapAsync<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Promise<U>
): Promise<Result<U, E>> {
  return result.ok ? success(await fn(result.value)) : result;
}

/**
 * Chains a Result-returning function onto a Result.
 * Also known as flatMap or bind in other languages.
 *
 * If the initial Result is successful, applies the function to the value.
 * If the initial Result is a failure, returns the error unchanged.
 */
export function chain<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

/**
 * Asynchronously chains a Result-returning function onto a Result.
 */
export async function chainAsync<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Promise<Result<U, E>>
): Promise<Result<U, E>> {
  return result.ok ? fn(result.value) : result;
}

/**
 * Maps the error of a failed Result to a new error.
 * If the Result is successful, returns the value unchanged.
 */
export function mapError<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F
): Result<T, F> {
  return result.ok ? result : failure(fn(result.error));
}

/**
 * Recovers from an error by providing a default value.
 * If the Result is successful, returns the value unchanged.
 * If the Result is a failure, applies the recovery function to the error.
 */
export function recover<T, E>(result: Result<T, E>, fn: (error: E) => T): T {
  return result.ok ? result.value : fn(result.error);
}
