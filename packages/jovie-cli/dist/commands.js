import { createProfile, fetchArtist, fetchArtistLlms, fetchOpenApi, fetchSiteLlms, reportIssue, } from './client.js';
function required(input) {
    return input.arg ?? '';
}
const REPORT_FLAGS = [
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
function report(kind) {
    return (input, options) => reportIssue({
        kind,
        title: input.flags?.title ?? '',
        details: input.flags?.details ?? '',
    }, {
        command: input.flags?.command,
        apiCode: input.flags?.code,
        scenario: input.flags?.scenario,
        channel: input.meta?.channel,
        cliVersion: input.meta?.version,
        platform: `${process.platform}-${process.arch}`,
        runtime: `node ${process.versions.node}`,
    }, options);
}
export const COMMANDS = [
    {
        path: ['profile', 'create'],
        tool: 'create_profile',
        summary: 'Create (or find) a Jovie profile for a Spotify artist. Returns profileUrl and, when unclaimed, a claimUrl the artist opens to take ownership.',
        arg: {
            name: 'url',
            description: 'Spotify artist URL, e.g. https://open.spotify.com/artist/<id>',
        },
        readOnly: false,
        run: (input, options) => createProfile(required(input), options),
    },
    {
        path: ['artist', 'get'],
        tool: 'get_artist',
        summary: 'Fetch a public artist profile: bio, links, releases, events, merch.',
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
        summary: 'Fetch the Jovie agent guide (llms.txt; full=true for llms-full.txt).',
        acceptsFull: true,
        readOnly: true,
        run: (input, options) => fetchSiteLlms(input.full === true, options),
    },
    {
        path: ['report', 'bug'],
        tool: 'report_issue',
        summary: 'Report a Jovie bug you hit (something failed or returned wrong data). Returns a reportId.',
        flags: REPORT_FLAGS,
        readOnly: false,
        run: report('bug'),
    },
    {
        path: ['report', 'feedback'],
        tool: 'report_feedback',
        summary: 'Send feedback on Jovie (confusing, missing, or slow). Returns a reportId.',
        flags: REPORT_FLAGS,
        readOnly: false,
        run: report('feedback'),
    },
];
export function findCommand(positionals) {
    return COMMANDS.find(command => command.path[0] === positionals[0] && command.path[1] === positionals[1]);
}
//# sourceMappingURL=commands.js.map