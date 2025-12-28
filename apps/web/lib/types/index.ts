/**
 * Type utilities and re-exports for the Jovie application.
 */

export type { Result } from './result';
export {
  chain,
  chainAsync,
  failure,
  isFailure,
  isSuccess,
  map,
  mapAsync,
  mapError,
  recover,
  success,
  unwrap,
  unwrapOr,
} from './result';
