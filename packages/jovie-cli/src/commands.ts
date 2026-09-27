import {
  createProfile,
  fetchArtist,
  fetchArtistLlms,
  fetchOpenApi,
  fetchSiteLlms,
  type ResourceOptions,
} from './client.js';

export interface CommandInput {
  readonly arg?: string;
  readonly full?: boolean;
}

/** One definition drives CLI dispatch, `--help`, and MCP tools. */
export interface CommandSpec {
  readonly path: readonly [string, string];
  readonly tool: string;
  readonly summary: string;
  readonly arg?: { readonly name: string; readonly description: string };
  readonly acceptsFull?: boolean;
  readonly readOnly: boolean;
  readonly run: (
    input: CommandInput,
    options: ResourceOptions
  ) => Promise<unknown>;
}

function required(input: CommandInput): string {
  return input.arg ?? '';
}

export const COMMANDS: readonly CommandSpec[] = [
  {
    path: ['profile', 'create'],
    tool: 'create_profile',
    summary:
      'Create (or find) a Jovie profile for a Spotify artist. Returns profileUrl and, when unclaimed, a claimUrl the artist opens to take ownership.',
    arg: {
      name: 'url',
      description:
        'Spotify artist URL, e.g. https://open.spotify.com/artist/<id>',
    },
    readOnly: false,
    run: (input, options) => createProfile(required(input), options),
  },
  {
    path: ['artist', 'get'],
    tool: 'get_artist',
    summary:
      'Fetch a public artist profile: bio, links, releases, events, merch.',
    arg: { name: 'username', description: 'Jovie username, e.g. radiohead' },
    readOnly: true,
    run: (input, options) => fetchArtist(required(input), options),
  },
  {
    path: ['artist', 'llms'],
    tool: 'get_artist_guide',
    summary: "Fetch an artist's machine-readable guide (llms.txt).",
    arg: { name: 'username', description: 'Jovie username' },
    readOnly: true,
    run: (input, options) => fetchArtistLlms(required(input), options),
  },
  {
    path: ['api', 'openapi'],
    tool: 'get_openapi',
    summary: 'Fetch the public Jovie OpenAPI contract.',
    readOnly: true,
    run: (_input, options) => fetchOpenApi(options),
  },
  {
    path: ['docs', 'llms'],
    tool: 'get_docs',
    summary:
      'Fetch the Jovie agent guide (llms.txt; full=true for llms-full.txt).',
    acceptsFull: true,
    readOnly: true,
    run: (input, options) => fetchSiteLlms(input.full === true, options),
  },
];

export function findCommand(
  positionals: readonly string[]
): CommandSpec | undefined {
  return COMMANDS.find(
    command =>
      command.path[0] === positionals[0] && command.path[1] === positionals[1]
  );
}
