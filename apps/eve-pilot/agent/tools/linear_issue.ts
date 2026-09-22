import { defineDynamic, defineTool } from 'eve/tools';
import { z } from 'zod';
import {
  LinearRequestError,
  LinearUnavailableError,
  openLinearIssueWithReadback,
} from '../lib/linear-client';
import {
  EvePilotCapabilityDeniedError,
  eveIdentityForRuntime,
} from '../select-identity';

const linearIssueInputSchema = z.object({
  teamKey: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z][A-Za-z0-9]{0,9}$/u,
      'team key must be 1-10 alphanumerics'
    ),
  title: z.string().trim().min(4).max(160),
  description: z.string().trim().min(1).max(8000),
  founderIntent: z
    .string()
    .trim()
    .min(16)
    .max(2000)
    .describe(
      'Explicit founder-intent quote authorizing this coordination write.'
    ),
  sourceRef: z
    .string()
    .trim()
    .min(3)
    .max(300)
    .describe(
      'Provenance for the founder intent (e.g. iMessage thread receipt).'
    ),
});

/**
 * Linear coordination write for Summer only. The capability pack is the
 * authority: the jovie/artist identity is denied here, and the
 * ovie-summer-shadow source stays read-only by channel contract. A successful
 * receipt always includes a verified readback; it is not execution completion
 * and not delivery acceptance.
 */
export const linearIssueTool = defineTool({
  description:
    'Open one Linear issue as Summer, gated on the linear-coordination-write capability, explicit founder intent with provenance, and a readback before any coordination-write claim. Never use this for execution completion.',
  inputSchema: linearIssueInputSchema,
  async execute(input) {
    try {
      eveIdentityForRuntime().require('linear-coordination-write');
    } catch (error) {
      if (error instanceof EvePilotCapabilityDeniedError) {
        return {
          ok: false as const,
          code: 'capability_denied' as const,
        };
      }
      return {
        ok: false as const,
        code: 'runtime_identity_unavailable' as const,
      };
    }
    try {
      const receipt = await openLinearIssueWithReadback({
        teamKey: input.teamKey.toUpperCase(),
        title: input.title,
        description: input.description,
        founderIntent: input.founderIntent,
        sourceRef: input.sourceRef,
      });
      return { ok: true as const, receipt };
    } catch (error) {
      if (error instanceof LinearUnavailableError) {
        return { ok: false as const, code: 'linear_unconfigured' as const };
      }
      if (error instanceof LinearRequestError) {
        return { ok: false as const, code: error.code };
      }
      return { ok: false as const, code: 'linear_write_failed' as const };
    }
  },
});

/**
 * The pilot root keeps a no-static-tools contract (tests/eve-framework-smoke
 * asserts info.tools is empty). Expose the write tool only to sessions
 * authenticated as the Summer identity; execute() still enforces the
 * capability pack as the real authority.
 */
export default defineDynamic({
  events: {
    'session.started': (_event, ctx) =>
      ctx.session.auth.current?.attributes.identity === 'summer'
        ? linearIssueTool
        : null,
    'turn.started': (_event, ctx) =>
      ctx.session.auth.current?.attributes.identity === 'summer'
        ? linearIssueTool
        : null,
  },
});
