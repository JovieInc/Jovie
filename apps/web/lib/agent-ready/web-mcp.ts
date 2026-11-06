/**
 * WebMCP (document.modelContext) registration for the public site.
 * One read-only tool: look up a creator's public profile through the same
 * anonymous API any agent can call. No writes, no auth, no navigation.
 */

const HANDLE_PATTERN = /^[a-zA-Z0-9._-]{1,30}$/;

type ToolResult = { content: { type: 'text'; text: string }[] };

type ModelContext = {
  registerTool: (
    tool: {
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
      annotations?: Record<string, unknown>;
      execute: (input: { username?: unknown }) => Promise<ToolResult>;
    },
    options?: { signal?: AbortSignal }
  ) => unknown;
};

const text = (value: string): ToolResult => ({
  content: [{ type: 'text', text: value }],
});

export function readModelContext(
  doc: Document,
  nav: Navigator
): ModelContext | null {
  const candidate =
    (doc as unknown as { modelContext?: ModelContext }).modelContext ??
    (nav as unknown as { modelContext?: ModelContext }).modelContext;
  return candidate && typeof candidate.registerTool === 'function'
    ? candidate
    : null;
}

export function registerJovieWebMcpTools(
  context: ModelContext,
  fetchImpl: typeof fetch,
  signal?: AbortSignal
): void {
  const registered = context.registerTool(
    {
      name: 'get_public_creator_profile',
      description:
        'Read a creator’s public Jovie profile (links, releases, events, merch) by handle. Read-only; returns JSON from jov.ie/api/v1. A not-found result means no public profile exists for that handle.',
      inputSchema: {
        type: 'object',
        properties: {
          username: {
            type: 'string',
            description: 'The creator handle, as in jov.ie/{username}.',
            pattern: HANDLE_PATTERN.source,
          },
        },
        required: ['username'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      async execute({ username }) {
        if (typeof username !== 'string' || !HANDLE_PATTERN.test(username))
          return text('Invalid handle.');
        const response = await fetchImpl(
          `/api/v1/${encodeURIComponent(username)}`,
          { headers: { accept: 'application/json' }, credentials: 'omit' }
        );
        if (response.status === 404) return text('No public profile found.');
        if (!response.ok)
          return text(`Profile lookup unavailable (HTTP ${response.status}).`);
        return text(await response.text());
      },
    },
    { signal }
  );
  // The API returns a Promise; a rejection must not surface as an error.
  if (
    registered &&
    typeof (registered as Promise<unknown>).catch === 'function'
  )
    (registered as Promise<unknown>).catch(() => undefined);
}
