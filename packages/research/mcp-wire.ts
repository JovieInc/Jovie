/** Parse one MCP streamable-HTTP response (JSON or SSE) into the tool's JSON payload. */
export function parseMcpBody(body: string, contentType: string): unknown {
  const messages = contentType.includes('text/event-stream')
    ? body
        .split('\n')
        .filter(line => line.startsWith('data: '))
        .map(line => JSON.parse(line.slice(6)) as Record<string, unknown>)
    : [JSON.parse(body) as Record<string, unknown>];
  const message = messages.at(-1);
  if (!message) throw new Error('mcp: empty response');
  if (message.error) {
    throw new Error(
      `mcp error: ${JSON.stringify(message.error).slice(0, 300)}`
    );
  }
  const result = message.result as {
    isError?: boolean;
    content?: { type: string; text?: string }[];
  };
  const text = result?.content?.[0]?.text ?? '';
  if (result?.isError) throw new Error(`mcp tool error: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
