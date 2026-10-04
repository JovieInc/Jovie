import {
  createProfile,
  fetchArtist,
  fetchArtistLlms,
  fetchOpenApi,
  fetchSiteLlms,
  lookupCreator,
  type ReportKind,
  type ResourceOptions,
  reportIssue,
} from './client.js';
import { invokeFleetAction } from './fleet-client.js';
import { FLEET_COMMANDS } from './fleet-contract.generated.js';

export interface CommandInput {
  readonly arg?: string;
  readonly full?: boolean;
  readonly flags?: Readonly<Record<string, string | undefined>>;
  /** Set by the caller (CLI or MCP); attached to reports as safe context. */
  readonly meta?: { readonly channel: 'cli' | 'mcp'; readonly version: string };
}

export interface FlagSpec {
  readonly name: string;
  readonly description: string;
  readonly required?: boolean;
}

/** One definition drives CLI dispatch, `--help`, and MCP tools. */
export interface CommandSpec {
  readonly path: readonly [string, string];
  readonly tool: string;
  readonly summary: string;
  readonly arg?: { readonly name: string; readonly description: string };
  readonly acceptsFull?: boolean;
  readonly flags?: readonly FlagSpec[];
  readonly readOnly: boolean;
  readonly internal?: boolean;
  readonly run: (
    input: CommandInput,
    options: ResourceOptions
  ) => Promise<unknown>;
}

function required(input: CommandInput): string {
  return input.arg ?? '';
}

const REPORT_FLAGS: readonly FlagSpec[] = [
  { name: 'title', description: 'One-line summary', required: true },
  {
    name: 'details',
    description: 'What you tried, what happened, what you expected',
    required: true,
  },
  { name: 'command', description: 'Jovie command or tool that failed' },
  { name: 'code', description: 'apiCode/error code you received' },
  { name: 'scenario', description: 'Task or scenario you were attempting' },
];

function report(kind: ReportKind) {
  return (input: CommandInput, options: ResourceOptions) =>
    reportIssue(
      {
        kind,
        title: input.flags?.title ?? '',
        details: input.flags?.details ?? '',
      },
      {
        command: input.flags?.command,
        apiCode: input.flags?.code,
        scenario: input.flags?.scenario,
        channel: input.meta?.channel,
        cliVersion: input.meta?.version,
        platform: `${process.platform}-${process.arch}`,
        runtime: `node ${process.versions.node}`,
      },
      options
    );
}

export const COMMANDS: readonly CommandSpec[] = [
  ...FLEET_COMMANDS.map(command => ({
    internal: true,
    path: command.path,
    tool: command.tool,
    summary: command.summary,
    readOnly: command.readOnly,
    flags: [
      {
        name: 'profile',
        description: 'Provisioned worker profile UUID',
        required: true,
      },
      {
        name: 'idempotency-key',
        description: 'Stable retry key for this invocation',
        required: true,
      },
      {
        name: 'input',
        description: 'Canonical domain input as JSON',
        required: true,
      },
    ],
    run: (input: CommandInput, options: ResourceOptions) =>
      invokeFleetAction(
        command.id,
        {
          profile: input.flags?.profile ?? '',
          key: input.flags?.['idempotency-key'] ?? '',
          value: input.flags?.input ?? '',
          channel: input.meta?.channel ?? 'cli',
          version: input.meta?.version ?? '0.0.0',
        },
        options
      ),
  })),
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
    path: ['creator', 'lookup'],
    tool: 'lookup_creator',
    summary:
      'Extract public creator fields from a YouTube channel URL without creating a profile.',
    arg: {
      name: 'url',
      description: 'Supported creator profile URL',
    },
    readOnly: true,
    run: (input, options) => lookupCreator(required(input), options),
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
  {
    path: ['report', 'bug'],
    tool: 'report_issue',
    summary:
      'Report a Jovie bug you hit (something failed or returned wrong data). Returns a reportId.',
    flags: REPORT_FLAGS,
    readOnly: false,
    run: report('bug'),
  },
  {
    path: ['report', 'feedback'],
    tool: 'report_feedback',
    summary:
      'Send feedback on Jovie (confusing, missing, or slow). Returns a reportId.',
    flags: REPORT_FLAGS,
    readOnly: false,
    run: report('feedback'),
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
