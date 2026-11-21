import { linearRequest } from '../lib/linear-cooldown.mjs';
import { withLinearRetry } from '../lib/linear-retry.mjs';

/** @typedef {import('./pen-draft-publish.mjs').Context} Context */
/** @typedef {import('./pen-draft-publish.mjs').Failure} Failure */
/** @typedef {import('./pen-draft-publish.mjs').GraphqlOk} GraphqlOk */

/**
 * One Linear GraphQL call in the shape scripts/lib/linear-retry.mjs retries.
 * @param {Context} ctx
 * @param {string} op
 * @param {string} query
 * @param {Record<string, unknown>} variables
 * @returns {Promise<GraphqlOk | Failure>}
 */
export async function linearGraphql(ctx, op, query, variables) {
  const result = await linearRequest({
    key: ctx.apiKey,
    query,
    variables,
    fetchImpl: ctx.fetchImpl,
    env: ctx.env,
  });
  if (result.rateLimited) return { ok: false, reason: 'linear_rate_limited' };
  if (result.reason === 'missing_linear_api_key')
    return { ok: false, reason: result.reason };
  if (result.reason === 'transport')
    return { ok: false, reason: `${op}_transport` };
  if (!result.ok) return { ok: false, reason: `${op}_${result.status}` };
  if (Array.isArray(result.data?.errors) && result.data.errors.length > 0)
    return {
      ok: false,
      reason: `${op}_graphql_error`,
      detail: String(result.data.errors[0]?.message ?? '').slice(0, 200),
    };
  return { ok: true, data: result.data?.data ?? null };
}

/**
 * @template {{ok: boolean, reason?: string}} T
 * @param {Context} ctx
 * @param {string} frame
 * @param {string} op
 * @param {() => Promise<T>} run
 * @returns {Promise<T>}
 */
export const retried = (ctx, frame, op, run) =>
  withLinearRetry(run, {
    fingerprint: frame,
    op,
    sleep: ctx.sleep,
    log: ctx.log,
  });
