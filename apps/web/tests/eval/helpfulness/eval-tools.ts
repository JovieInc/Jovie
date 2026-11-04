/**
 * Stub tool set for the helpfulness eval. Shared schemas come from
 * TOOL_SCHEMAS; route-only tools (defined inline in app/api/chat/route.ts)
 * mirror their production descriptions here. Every execute returns fixture
 * data and never writes, calls a provider or touches the DB.
 */

import { z } from 'zod';
import { CHAT_ROUTE_TOOL_IDS } from '@/lib/chat/chat-tool-inventory';
import { TOOL_SCHEMAS } from '@/lib/chat/tool-schemas';
import type { EvalFixture } from './fixtures';

const ROUTE_ONLY_TOOLS: Record<
  string,
  { description: string; input: z.ZodTypeAny }
> = {
  showTopInsights: {
    description:
      "Show the artist's top audience, release, track, and monetization signals as structured insight cards. Call ONLY when the artist is asking about performance, growth, audience, signals, analytics, what is working, or what to focus on next. Do NOT call for distribution deals (e.g. AWAL), legal, bio edits, canvas, album art, merch, billing, or other unrelated topics.",
    input: z.object({}),
  },
  createPromoStrategy: {
    description:
      'Create a comprehensive promotion strategy for a release, including social media video ads, TikTok strategy, Spotify Canvas, and ad targeting recommendations. Use this when an artist asks for help promoting their music.',
    input: z.object({ releaseTitle: z.string().optional() }),
  },
  writeWorldClassBio: {
    description:
      'Write a world-class artist bio in an editorial style suitable for Spotify, Apple Music, and press use. Uses real artist context from profile + DSP metadata.',
    input: z.object({ tone: z.string().optional() }),
  },
  proposeProfileEdit: {
    description:
      'Propose an edit to the artist profile (displayName or bio) and show a confirmation preview.',
    input: z.object({ field: z.string(), newValue: z.string() }),
  },
  createRelease: {
    description:
      "Create a new release in the artist's discography. Use this when the artist wants to add a release that isn't synced from Spotify, for example a new single, EP, or album they want to set up smart links for. Ask for the title and release type at minimum before calling this tool.",
    input: z.object({
      title: z.string(),
      releaseType: z.string(),
      releaseDate: z.string().optional(),
    }),
  },
  suggestRelatedArtists: {
    description:
      'Suggest related artists for collaboration, playlist adjacency, or support slots based on the artist’s genres and audience.',
    input: z.object({ goal: z.string().optional() }),
  },
  checkCanvasStatus: {
    description:
      "Check which of the artist's releases have Spotify Canvas videos set and which are missing them. Use this when the artist asks about canvas videos or wants to generate them.",
    input: z.object({}),
  },
  generateCanvasPlan: {
    description:
      'Generate a detailed plan for creating a Spotify Canvas video from album artwork. Use this when an artist wants to create a canvas for a specific release.',
    input: z.object({ releaseTitle: z.string().optional() }),
  },
};

export interface EvalToolSpec {
  readonly name: string;
  readonly description: string;
  /** JSON Schema for the function parameters (OpenAI tool format). */
  readonly parameters: Record<string, unknown>;
  readonly execute: (input: unknown) => unknown;
}

function stubResult(name: string, fixture: EvalFixture): unknown {
  switch (name) {
    case 'showTopInsights':
      return fixture.insights;
    case 'suggestRelatedArtists':
      return {
        success: true,
        artists: [
          { name: 'Fictional Artist A', reason: 'shared ambient playlists' },
          { name: 'Fictional Artist B', reason: 'similar audience size' },
        ],
      };
    case 'checkCanvasStatus':
      return {
        success: true,
        releases: fixture.releases.map(r => ({
          title: r.title,
          canvas: 'not_set',
        })),
      };
    default:
      return { success: true, stub: true, note: 'Eval stub: completed.' };
  }
}

export function buildEvalToolSpecs(fixture: EvalFixture): EvalToolSpec[] {
  const shared = TOOL_SCHEMAS as Record<
    string,
    { description: string; inputSchema: z.ZodTypeAny }
  >;
  const specs: EvalToolSpec[] = [];
  for (const name of CHAT_ROUTE_TOOL_IDS) {
    const schema = shared[name]?.inputSchema ?? ROUTE_ONLY_TOOLS[name]?.input;
    const description =
      shared[name]?.description ?? ROUTE_ONLY_TOOLS[name]?.description;
    if (!schema || !description) continue;
    const parameters = z.toJSONSchema(schema, { io: 'input' }) as Record<
      string,
      unknown
    >;
    delete parameters.$schema;
    specs.push({
      name,
      description,
      parameters,
      execute: () => stubResult(name, fixture),
    });
  }
  return specs;
}
