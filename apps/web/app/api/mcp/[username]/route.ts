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
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { BASE_URL } from '@/constants/app';
import { getReleasesForProfileLite } from '@/lib/discography/queries';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { getLiveMerchCardsForProfile } from '@/lib/merch/service';
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
  const profile = await getProfileByUsername(username);

  if (!profile || !profile.isPublic) {
    return NextResponse.json(
      { error: 'Artist not found' },
      { status: 404, headers: NO_STORE_HEADERS }
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
  const profile = await getProfileByUsername(username);

  if (!profile || !profile.isPublic) {
    return mcpError(-32602, 'Artist not found', 404);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return mcpError(-32700, 'Parse error');
  }

  const parsed = mcpRequestSchema.safeParse(body);
  if (!parsed.success) {
    return mcpError(-32601, 'Method not found or invalid params');
  }
  const msg = parsed.data;

  // -------------------------------------------------------------------------
  // initialize
  // -------------------------------------------------------------------------
  if (msg.method === 'initialize') {
    return mcpOk({
      protocolVersion: '2025-11-05',
      capabilities: { resources: {}, tools: {} },
      serverInfo: {
        name: `jovie-artist-${profile.username}`,
        version: '1.0.0',
      },
    });
  }

  // -------------------------------------------------------------------------
  // resources/list
  // -------------------------------------------------------------------------
  if (msg.method === 'resources/list') {
    return mcpOk({ resources: buildResourceDescriptors(profile.username) });
  }

  // -------------------------------------------------------------------------
  // resources/read
  // -------------------------------------------------------------------------
  if (msg.method === 'resources/read') {
    const uri = msg.params.uri;
    const content = await readResource(uri, profile);
    if (!content) {
      return mcpError(-32602, `Unknown resource: ${uri}`);
    }
    return mcpOk({
      contents: [
        { uri, mimeType: 'application/json', text: JSON.stringify(content) },
      ],
    });
  }

  // -------------------------------------------------------------------------
  // tools/list
  // -------------------------------------------------------------------------
  if (msg.method === 'tools/list') {
    return mcpOk({ tools: buildToolDescriptors() });
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
      return mcpError(-32602, result.error);
    }
    return mcpOk({
      content: [{ type: 'text', text: JSON.stringify(result.data) }],
    });
  }

  return mcpError(-32601, 'Method not found');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mcpOk(result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id: 1, result });
}

function mcpError(code: number, message: string, status = 200) {
  return NextResponse.json(
    { jsonrpc: '2.0', id: 1, error: { code, message } },
    { status }
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

  return { error: `Unknown tool: ${name}` };
}
