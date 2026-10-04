import { z } from 'zod';
import {
  linkResultSchema,
  MAKE_LINK_ANNOTATIONS,
  makeLinkInputSchema,
} from './contract';

export const MAKE_LINK_TOOL_NAME = 'make_link';

export const MAKE_LINK_DESCRIPTION =
  'Make one public Jovie link for a track or artist. Pass a streaming URL, an ISRC, or text. A name returns candidates: ask the person to choose, then call again with the chosen URL. Return shortUrl as the answer. The link is unclaimed until the artist opens claimUrl. Do not quote prices, name paid plans, or start checkout.';

export function makeLinkToolDefinition() {
  return {
    name: MAKE_LINK_TOOL_NAME,
    title: 'Make a Jovie link',
    description: MAKE_LINK_DESCRIPTION,
    inputSchema: z.toJSONSchema(makeLinkInputSchema, { target: 'draft-7' }),
    outputSchema: z.toJSONSchema(linkResultSchema, { target: 'draft-7' }),
    annotations: MAKE_LINK_ANNOTATIONS,
    securitySchemes: [{ type: 'noauth' }],
    _meta: { securitySchemes: [{ type: 'noauth' }] },
  };
}
