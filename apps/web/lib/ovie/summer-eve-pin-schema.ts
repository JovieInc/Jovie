import { z } from 'zod';
import { SUMMER_PRODUCTION } from './summer-production-identity';

/** Immutable deployment URL. Same object as `ServerEnvSchema`. */
export const ovieSummerEveDeploymentOriginSchema = z
  .string()
  .url()
  .regex(
    /^https:\/\/(?:jovie-eve-shadow|summer-operations)-[a-z0-9]+-jovie\.vercel\.app$/u,
    `Must be an immutable Summer deployment URL for ${SUMMER_PRODUCTION.projectId}`
  )
  .optional();

/** Expected `dpl_` id. Same object as `ServerEnvSchema`. */
export const ovieSummerEveExpectedDeploymentIdSchema = z
  .string()
  .regex(/^dpl_[A-Za-z0-9]+$/u)
  .optional();
