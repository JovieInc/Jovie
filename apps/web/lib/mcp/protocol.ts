/** Supported revisions in preference order, shared by the HTTP MCP routes. */
export const MCP_SUPPORTED_PROTOCOL_VERSIONS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
] as const;

export function negotiateMcpProtocolVersion(requestedVersion: unknown) {
  return (
    MCP_SUPPORTED_PROTOCOL_VERSIONS.find(
      version => version === requestedVersion
    ) ?? MCP_SUPPORTED_PROTOCOL_VERSIONS[0]
  );
}
