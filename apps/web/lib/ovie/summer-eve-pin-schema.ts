import { z } from 'zod';

/**
 * Deprecated and ignored. Production Summer is `https://summer.jov.ie`.
 * Delete `OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN` from Vercel production.
 * A leftover per-deployment URL must not choose the caller and must not
 * fail boot.
 */
export const ovieSummerEveDeploymentOriginSchema = z.string().optional();

/**
 * Deprecated and ignored, whether set or unset. Exact deployment-id
 * equality is not a Summer gate. Delete
 * `OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID` from Vercel production.
 */
export const ovieSummerEveExpectedDeploymentIdSchema = z.string().optional();
