/**
 * Jovie MCP (Model Context Protocol) server — per-artist endpoint.
 *
 * Exposes artist data as MCP Resources and MCP Tools so AI agents can
 * read structured artist entities and take purchasable actions.
 *
 * Protocol: https://modelcontextprotocol.io/specification/2025-11-05
 *
 * Resources exposed:
 *   - artist://bio       → artist bio + identity
 *   - artist://releases  → discography
 *   - artist://events    → upcoming tour dates
 *   - artist://merch     → live merch catalog
 *
 * Tools exposed:
 *   - get_ticket_link           → resolve a ticket URL for an event
 *   - check_merch_availability  → confirm a merch item is purchasable
 *   - add_to_cart               → redirect to the merch purchase URL
 *   - generate_merch             → generate three draft design options (auth)
 *   - select_merch_design        → select an option and create a draft (auth)
 *   - publish_merch_card         → propose or confirm publication (auth)
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { BASE_URL } from '@/constants/app';
import { getCachedAuth } from '@/lib/auth/cached';
import { proposeMerchAction } from '@/lib/chat/tools/merch-propose';
import { getReleasesForProfileLite } from '@/lib/discography/queries';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  createMerchGeneration,
  getLiveMerchCardsForProfile,
  publishMerchCard,
  selectMerchDesign,
} from '@/lib/merch/service';
import {
  isPublicProfileIndexable,
  PUBLIC_PROFILE_DISCOVERY_EXCLUSION_HEADERS,
} from '@/lib/profile/public-profile-indexing-policy';
import { getProfileByUsername } from '@/lib/services/profile';
import { getUpcomingTourDatesForProfile } from '@/lib/tour-dates/queries';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// MCP request schema
// ---------------------------------------------------------------------------

const mcpRequestSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('initialize') }),
  z.object({ method: z.literal('resources/list') }),
  z.object({
    method: z.literal('resources/read'),
    params: z.object({ uri: z.string() }),
  }),
  z.object({ method: z.literal('tools/list') }),
  z.object({
    method: z.literal('tools/call'),
    params: z.object({
      name: z.string(),
      arguments: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
]);

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  if (!isPublicProfileIndexable(username)) {
    return NextResponse.json(
      { error: 'Artist not found' },
      { status: 404, headers: PUBLIC_PROFILE_DISCOVERY_EXCLUSION_HEADERS }
    );
  }

  const profile = await getProfileByUsername(username);

  if (!profile || !profile.isPublic) {
    return NextResponse.json(
      { error: 'Artist not found' },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }
  if (!isPublicProfileIndexable(profile.username)) {
    return NextResponse.json(
      { error: 'Artist not found' },
      { status: 404, headers: PUBLIC_PROFILE_DISCOVERY_EXCLUSION_HEADERS }
    );
  }

  // Return MCP server manifest on GET (discovery)
  const profileUrl = `${BASE_URL}/${profile.username}`;
  return NextResponse.json({
    name: `jovie-artist-${profile.username}`,
    version: '1.0.0',
    description: `MCP server for ${profile.displayName ?? profile.username} on Jovie`,
    resources: buildResourceDescriptors(profile.username),
    tools: buildToolDescriptors(),
    _links: {
      profile: profileUrl,
      api: `${BASE_URL}/api/v1/${profile.username}`,
    },
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  if (!isPublicProfileIndexable(username)) {
    return mcpError(
      -32602,
      'Artist not found',
      404,
      null,
      PUBLIC_PROFILE_DISCOVERY_EXCLUSION_HEADERS
    );
  }

  const profile = await getProfileByUsername(username);

  if (!profile || !profile.isPublic) {
    return mcpError(-32602, 'Artist not found', 404);
  }
  if (!isPublicProfileIndexable(profile.username)) {
    return mcpError(
      -32602,
      'Artist not found',
      404,
      null,
      PUBLIC_PROFILE_DISCOVERY_EXCLUSION_HEADERS
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return mcpError(-32700, 'Parse error', 200, null);
  }

  // Extract JSON-RPC id before method dispatch so all responses can echo it.
  // Per JSON-RPC 2.0 §5, the response id MUST match the request id exactly.
  // If id is absent (notification) we pass undefined so mcpOk/mcpError omit it.
  const idParse = z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .safeParse((body as Record<string, unknown>)?.id);
  const requestId: JsonRpcId | undefined = idParse.success
    ? idParse.data
    : undefined;

  const parsed = mcpRequestSchema.safeParse(body);
  if (!parsed.success) {
    return mcpError(
      -32601,
      'Method not found or invalid params',
      200,
      requestId
    );
  }
  const msg = parsed.data;

  // -------------------------------------------------------------------------
  // initialize
  // -------------------------------------------------------------------------
  if (msg.method === 'initialize') {
    return mcpOk(
      {
        protocolVersion: '2025-11-05',
        capabilities: { resources: {}, tools: {} },
        serverInfo: {
          name: `jovie-artist-${profile.username}`,
          version: '1.0.0',
        },
      },
      requestId
    );
  }

  // -------------------------------------------------------------------------
  // resources/list
  // -------------------------------------------------------------------------
  if (msg.method === 'resources/list') {
    return mcpOk(
      { resources: buildResourceDescriptors(profile.username) },
      requestId
    );
  }

  // -------------------------------------------------------------------------
  // resources/read
  // -------------------------------------------------------------------------
  if (msg.method === 'resources/read') {
    const uri = msg.params.uri;
    const content = await readResource(uri, profile);
    if (!content) {
      return mcpError(-32602, `Unknown resource: ${uri}`, 200, requestId);
    }
    return mcpOk(
      {
        contents: [
          { uri, mimeType: 'application/json', text: JSON.stringify(content) },
        ],
      },
      requestId
    );
  }

  // -------------------------------------------------------------------------
  // tools/list
  // -------------------------------------------------------------------------
  if (msg.method === 'tools/list') {
    return mcpOk({ tools: buildToolDescriptors() }, requestId);
  }

  // -------------------------------------------------------------------------
  // tools/call
  // -------------------------------------------------------------------------
  if (msg.method === 'tools/call') {
    const result = await callTool(
      msg.params.name,
      msg.params.arguments ?? {},
      profile
    );
    if (result.error) {
      return mcpError(-32602, result.error, 200, requestId);
    }
    return mcpOk(
      { content: [{ type: 'text', text: JSON.stringify(result.data) }] },
      requestId
    );
  }

  return mcpError(-32601, 'Method not found', 200, requestId);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type JsonRpcId = string | number | null;

function mcpOk(result: unknown, requestId: JsonRpcId | undefined) {
  return NextResponse.json(
    requestId !== undefined
      ? { jsonrpc: '2.0', id: requestId, result }
      : { jsonrpc: '2.0', result }
  );
}

function mcpError(
  code: number,
  message: string,
  status = 200,
  requestId: JsonRpcId | undefined = null,
  headers?: HeadersInit
) {
  return NextResponse.json(
    requestId !== undefined
      ? { jsonrpc: '2.0', id: requestId, error: { code, message } }
      : { jsonrpc: '2.0', error: { code, message } },
    { status, headers }
  );
}

function buildResourceDescriptors(username: string) {
  const base = `artist://${username}`;
  return [
    { uri: `${base}/bio`, name: 'Artist bio', mimeType: 'application/json' },
    {
      uri: `${base}/releases`,
      name: 'Discography',
      mimeType: 'application/json',
    },
    {
      uri: `${base}/events`,
      name: 'Upcoming tour dates',
      mimeType: 'application/json',
    },
    {
      uri: `${base}/merch`,
      name: 'Merch catalog',
      mimeType: 'application/json',
    },
  ];
}

function buildToolDescriptors() {
  return [
    {
      name: 'get_ticket_link',
      description: 'Resolve the ticket purchase URL for a specific tour event.',
      inputSchema: {
        type: 'object',
        properties: {
          eventId: {
            type: 'string',
            description: 'Event ID from the events resource',
          },
        },
        required: ['eventId'],
      },
    },
    {
      name: 'check_merch_availability',
      description:
        'Confirm whether a merch item is currently available for purchase.',
      inputSchema: {
        type: 'object',
        properties: {
          itemId: {
            type: 'string',
            description: 'Merch item ID from the merch resource',
          },
        },
        required: ['itemId'],
      },
    },
    {
      name: 'add_to_cart',
      description:
        'Return the direct URL to add a merch item to cart or purchase it.',
      inputSchema: {
        type: 'object',
        properties: {
          itemId: { type: 'string', description: 'Merch item ID' },
        },
        required: ['itemId'],
      },
    },
    {
      name: 'generate_merch',
      description:
        'Generate exactly three merch design options for the authenticated owner of this artist profile. Creates drafts only; it never publishes.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', maxLength: 500 },
          itemType: { type: 'string', maxLength: 80 },
        },
      },
    },
    {
      name: 'select_merch_design',
      description:
        'Select one generated merch option for the authenticated owner and create a draft merch card. Returns a publish confirmation proposal; it does not publish.',
      inputSchema: {
        type: 'object',
        properties: {
          generationId: { type: 'string', format: 'uuid' },
          optionNumber: { type: 'integer', minimum: 1, maximum: 3 },
          optionId: { type: 'string', format: 'uuid' },
        },
        required: ['generationId'],
      },
    },
    {
      name: 'publish_merch_card',
      description:
        'Propose publishing a merch card, or publish it only when confirmed is explicitly true. Requires authenticated ownership and the existing merch sellability checks.',
      inputSchema: {
        type: 'object',
        properties: {
          merchCardId: { type: 'string', format: 'uuid' },
          confirmed: {
            type: 'boolean',
            description:
              'Set true only after the artist explicitly confirms the publish proposal.',
          },
        },
        required: ['merchCardId'],
      },
    },
  ];
}

type ProfileData = Awaited<ReturnType<typeof getProfileByUsername>>;

async function readResource(uri: string, profile: NonNullable<ProfileData>) {
  const username = profile.username;
  const base = `artist://${username}`;

  if (uri === `${base}/bio`) {
    return {
      id: profile.id,
      username: profile.username,
      name: profile.displayName ?? profile.username,
      bio: profile.bio ?? null,
      location: profile.location ?? null,
      genres: profile.genres ?? [],
      avatarUrl: profile.avatarUrl ?? null,
      spotifyUrl: profile.spotifyUrl ?? null,
      appleMusicUrl: profile.appleMusicUrl ?? null,
      youtubeUrl: profile.youtubeUrl ?? null,
    };
  }

  if (uri === `${base}/releases`) {
    const releases = await getReleasesForProfileLite(profile.id);
    return releases.map(r => ({
      id: r.id,
      title: r.title,
      type: r.releaseType,
      releaseDate: r.releaseDate ?? null,
      artworkUrl: r.artworkUrl ?? null,
    }));
  }

  if (uri === `${base}/events`) {
    const events = await getUpcomingTourDatesForProfile(profile.id);
    return events.map(e => ({
      id: e.id,
      title: e.title ?? null,
      startDate: e.startDate,
      venue: e.venueName,
      city: e.city,
      country: e.country,
      ticketUrl: e.ticketUrl ?? null,
      ticketStatus: e.ticketStatus,
    }));
  }

  if (uri === `${base}/merch`) {
    const merch = await getLiveMerchCardsForProfile(profile.id);
    return merch.map(m => ({
      id: m.id,
      title: m.title,
      description: m.description,
      productType: m.productType,
      imageUrl: m.primaryImageUrl,
      retailPriceCents: m.retailPriceCents,
      available: true,
    }));
  }

  return null;
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
  profile: NonNullable<ProfileData>
): Promise<{ data?: unknown; error?: string }> {
  const profileUrl = `${BASE_URL}/${profile.username}`;

  if (name === 'get_ticket_link') {
    const eventId = String(args.eventId ?? '');
    const events = await getUpcomingTourDatesForProfile(profile.id);
    const event = events.find(e => e.id === eventId);
    if (!event) return { error: `Event not found: ${eventId}` };
    return {
      data: {
        eventId,
        ticketUrl: event.ticketUrl ?? null,
        ticketStatus: event.ticketStatus,
      },
    };
  }

  if (name === 'check_merch_availability') {
    const itemId = String(args.itemId ?? '');
    const merch = await getLiveMerchCardsForProfile(profile.id);
    const item = merch.find(m => m.id === itemId);
    if (!item) return { error: `Merch item not found: ${itemId}` };
    return {
      data: {
        itemId,
        available: true,
        title: item.title,
        retailPriceCents: item.retailPriceCents,
      },
    };
  }

  if (name === 'add_to_cart') {
    const itemId = String(args.itemId ?? '');
    const merch = await getLiveMerchCardsForProfile(profile.id);
    const item = merch.find(m => m.id === itemId);
    if (!item) return { error: `Merch item not found: ${itemId}` };
    return { data: { itemId, checkoutUrl: `${profileUrl}/merch` } };
  }

  if (
    name === 'generate_merch' ||
    name === 'select_merch_design' ||
    name === 'publish_merch_card'
  ) {
    const { userId } = await getCachedAuth();
    if (!userId) return { error: 'Authentication required for merch writes' };

    if (name === 'generate_merch') {
      const parsed = z
        .object({
          prompt: z.string().max(500).optional(),
          itemType: z.string().max(80).optional(),
        })
        .safeParse(args);
      if (!parsed.success) return { error: 'Invalid generate_merch arguments' };

      const prompt = [
        parsed.data.prompt,
        parsed.data.itemType ? `Item type: ${parsed.data.itemType}` : undefined,
      ]
        .filter(Boolean)
        .join('\n')
        .trim();
      try {
        const result = await createMerchGeneration({
          profileId: profile.id,
          clerkUserId: userId,
          prompt: prompt || 'Make premium merch for this artist.',
          command: 'create_merch',
        });
        return {
          data: {
            ...result,
            nextStep:
              'Pick an option number, then review the publish proposal.',
          },
        };
      } catch {
        return { error: 'Unable to generate merch options' };
      }
    }

    if (name === 'select_merch_design') {
      const parsed = z
        .object({
          generationId: z.string().uuid(),
          optionNumber: z.number().int().min(1).max(3).optional(),
          optionId: z.string().uuid().optional(),
        })
        .refine(
          (value: { optionNumber?: number; optionId?: string }) =>
            value.optionNumber !== undefined || value.optionId
        )
        .safeParse(args);
      if (!parsed.success)
        return { error: 'Invalid select_merch_design arguments' };

      try {
        const result = await selectMerchDesign({
          generationId: parsed.data.generationId,
          clerkUserId: userId,
          optionNumber: parsed.data.optionNumber,
          optionId: parsed.data.optionId,
          publish: false,
        });
        if (!result.success) return { data: result };
        const publishProposal = await proposeMerchAction({
          action: 'publish',
          merchCardId: result.merchCardId,
          profileId: profile.id,
        });
        return { data: { ...result, publishProposal } };
      } catch {
        return { error: 'Unable to select merch design' };
      }
    }

    const parsed = z
      .object({
        merchCardId: z.string().uuid(),
        confirmed: z.boolean().optional().default(false),
      })
      .safeParse(args);
    if (!parsed.success)
      return { error: 'Invalid publish_merch_card arguments' };

    if (!parsed.data.confirmed) {
      const proposal = await proposeMerchAction({
        action: 'publish',
        merchCardId: parsed.data.merchCardId,
        profileId: profile.id,
      });
      return { data: { confirmed: false, proposal } };
    }

    try {
      const card = await publishMerchCard({
        cardId: parsed.data.merchCardId,
        profileId: profile.id,
        clerkUserId: userId,
      });
      return {
        data: {
          confirmed: true,
          success: true,
          merchCardId: card.id,
          status: card.status,
          title: card.title,
        },
      };
    } catch {
      return { error: 'Unable to publish merch card' };
    }
  }

  return { error: `Unknown tool: ${name}` };
}
