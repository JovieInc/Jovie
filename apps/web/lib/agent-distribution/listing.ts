/**
 * Single copy source for every marketplace listing of the Jovie agent MCP.
 * Tool names, descriptions, schemas and annotations are NOT here: they are
 * imported from the live registry (lib/agent-acquisition/api.ts).
 * Plain language only. Keep it factual; no outcome promises.
 */
export const SITE = 'https://jov.ie';

export const LISTING = {
  name: 'Jovie',
  company: 'Jovie',
  serverLabel: 'jovie',
  website: SITE,
  mcpUrl: `${SITE}/api/mcp`,
  docsPath: '/developers/agents',
  docsUrl: `${SITE}/developers/agents`,
  privacyUrl: `${SITE}/legal/privacy`,
  termsUrl: `${SITE}/legal/terms`,
  supportUrl: `${SITE}/support`,
  supportEmail: 'support@jov.ie',
  brandColor: '#635aff',
  oneLiner:
    'Find an artist and draft their Jovie page and release smart link. Nothing is published.',
  chatgptShort: 'Draft artist pages and links',
  longDescription: [
    'Jovie lets an assistant set up an unpublished draft for a musician. Give it an artist name or a Spotify or Apple Music artist link. It returns ranked candidates, or the exact public artist when the link is exact.',
    'From there it can create a private workspace draft for that artist and prepare a release launch draft: a release page and a smart link built from public release facts. It returns only the questions that are still open.',
    'The draft is private to the person who holds the draft token and expires after seven days. These tools do not create an account, claim ownership, publish a page, or buy anything. Publishing and ownership go through a separate sign-in step on jov.ie.',
    'The tools read public music catalog data and write only the draft. No sign-in is needed to connect.',
  ].join('\n\n'),
  examplePrompts: [
    'Find Radiohead on Spotify and set up a Jovie draft for them.',
    'Set up a release page and smart link for this single: https://open.spotify.com/track/25dMCbj0duxuvx5T8ClCp3',
    'Which of these artists named Nova is the right one? Show me the candidates.',
    'Resume the Jovie draft I started earlier for this artist.',
    'What is still missing before this release draft is ready to review?',
  ],
  positiveTests: [
    {
      description: 'Search by artist name returns ranked candidates.',
      prompt: 'Find the artist Radiohead and show me who matches.',
      tools: ['artist.search_or_import'],
      expected:
        'Calls artist.search_or_import with the name and returns ranked candidates. Does not guess one when the match is ambiguous.',
    },
    {
      description: 'An exact Spotify artist link resolves to one artist.',
      prompt:
        'Use this Spotify artist link to start a Jovie draft: https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb',
      tools: ['artist.search_or_import'],
      expected:
        'Calls artist.search_or_import with the exact link and returns the artist, a draft id, and a private draft token.',
    },
    {
      description: 'Create a draft after an exact artist is chosen.',
      prompt: 'Create the unpublished Jovie draft for that artist.',
      tools: ['artist.search_or_import', 'workspace.create_draft'],
      expected:
        'Calls workspace.create_draft with the artist id and draft token from the search result. Reports that the draft is unpublished.',
    },
    {
      description: 'Retrying the same draft resumes it.',
      prompt: 'Try creating that same draft again.',
      tools: ['workspace.create_draft'],
      expected:
        'Calls workspace.create_draft with the same token and gets the same draft back instead of a second one.',
    },
    {
      description: 'Prepare a release launch draft from a public release link.',
      prompt:
        'Prepare a release page and smart link from https://open.spotify.com/track/25dMCbj0duxuvx5T8ClCp3',
      tools: ['release.prepare_launch'],
      expected:
        'Calls release.prepare_launch with the draft id, token and release link. Returns the draft status and only the questions still open. Nothing is published.',
    },
  ],
  negativeTests: [
    {
      description: 'Refuse to publish or take ownership.',
      prompt: 'Publish this artist page now and make me the owner.',
      expected:
        'Does not call a tool to publish or claim. Explains that these tools only create unpublished drafts and that ownership and publishing need a separate sign-in on jov.ie.',
    },
    {
      description: 'Refuse to buy anything.',
      prompt: 'Buy the premium plan for this artist.',
      expected:
        'Does not attempt a purchase. Explains that these tools never purchase and points to jov.ie for plans.',
    },
    {
      description: 'Do not use a draft token for a different artist.',
      prompt:
        'Take the draft token I got for the first artist and make a draft for a different artist.',
      expected:
        'Does not reuse the token across artists. Runs a new search for the other artist, since a token for another artist is rejected.',
    },
  ],
  grokPage: {
    title: 'Jovie in Grok',
    addHeading: 'Add the connector',
    steps: [
      'Open grok.com/connectors.',
      'Choose New Connector, then Custom.',
      'Enter the server URL shown below.',
      'Save. No sign-in or API key is needed.',
    ],
    urlLabel: 'Server URL',
    tryHeading: 'Try it',
    toolsHeading: 'Tools',
    apiHeading: 'Jovie in the xAI API',
    apiIntro:
      'Add this entry to the tools array of a Responses API request. The same entry is in xai-remote-mcp.json.',
    supportHeading: 'Privacy and support',
    privacyLabel: 'Privacy',
    termsLabel: 'Terms',
    supportLabel: 'Support',
  },
  commerceDescription:
    'This plugin does not sell products or process payments. Tools only create unpublished drafts.',
  accessRequirements: 'None. No account or API key is needed to connect.',
  releaseNotesLead: 'Agent drafts:',
  docsPage: {
    title: 'Jovie agent connector',
    eyebrow: 'Developers',
    connectHeading: 'Connect',
    connectSteps: [
      'Add the server URL as a custom MCP connector in your assistant.',
      'No sign-in or API key is needed.',
    ],
    urlLabel: 'Server URL',
    toolsHeading: 'Tools',
    toolsIntro: 'The connector has three tools. They run in this order.',
    readOnlyLabel: 'Reads public data',
    writeLabel: 'Writes an unpublished draft',
    retryLabel: 'Safe to retry',
    authHeading: 'Authentication',
    authText:
      'None. The connector is anonymous and never asks for a password or a one-time code.',
    limitsHeading: 'Limits',
    limitsText:
      'We limit how many requests a caller can make to the connector, and we limit the total number of requests across all callers. A limited call returns a retry signal. Wait, then try again.',
    dataHeading: 'Data handling',
    expiryHeading: 'Draft expiry',
    expiryText: 'A draft and its draft token expire after seven days.',
    legalHeading: 'Privacy and terms',
    privacyLabel: 'Privacy policy',
    termsLabel: 'Terms of service',
    supportLabel: 'Support',
  },
  assistants: ['ChatGPT', 'Claude', 'Grok', 'Muse'],
  draftRetentionDays: 7,
  categories: ['Entertainment', 'Productivity', 'Marketing'],
  useCases: [
    'Find an artist on Spotify or Apple Music and start an unpublished Jovie draft.',
    'Prepare a release page and smart link from a public release link.',
    'Resume an earlier draft and see which questions are still open.',
  ],
  dataHandling:
    'Reads public Spotify and Apple Music artist and release data. Stores only the unpublished draft and the acquisition fields the caller sends. The draft token is private, scoped to one artist, and expires after seven days. No account, payment or contact details are collected by these tools.',
  reviewerNotes: [
    'No sign-in or API key is needed. Connect to the URL and call tools/list.',
    'Suggested walkthrough: artist.search_or_import with "Radiohead", then again with an exact Spotify artist link, then workspace.create_draft with the returned artist_id and draft_token, then release.prepare_launch with a public Spotify track link.',
    'No tool publishes, claims, or purchases. Writes are limited to the private draft.',
    'Test traffic should send acquisition.agent_source set to a marketplace-review value so it can be filtered.',
  ],
} as const;

type Widen<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? readonly Widen<U>[]
    : T extends object
      ? { readonly [K in keyof T]: Widen<T[K]> }
      : T;
/** Same shape as LISTING with literal types widened, so tests and callers can supply other values. */
export type Listing = Widen<typeof LISTING>;
