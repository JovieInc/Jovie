import { z } from 'zod';
import { SUMMER_PRODUCTION } from './summer-production-identity';

/**
 * Production Summer origin. The deprecated env parses when set to this
 * value. The caller does not read the env. Admission is
 * `GET /runtime/v1/identity` on this origin. The previous regex accepted
 * only an immutable `jovie-eve-shadow-<hash>` host and rejected this domain.
 */
export const SUMMER_ORIGIN_ENV_ACCEPTED = SUMMER_PRODUCTION.productionOrigin;

/**
 * Deprecated and ignored, whether set or unset.
 * `https://summer.jov.ie` parses. A leftover per-deployment URL also parses
 * so production boot does not fail before the variable is deleted. Neither
 * value selects the caller.
 */
export const ovieSummerEveDeploymentOriginSchema = z.string().optional();

/**
 * Deprecated and ignored, whether set or unset. Exact deployment-id
 * equality is not a Summer gate. Delete
 * `OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID` from Vercel production.
 */
export const ovieSummerEveExpectedDeploymentIdSchema = z.string().optional();
