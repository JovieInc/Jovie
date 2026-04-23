import 'server-only';

// Importing each tool file triggers its `registerTool` side effect.
// This barrel is the canonical way to ensure the registry is populated
// before any `callTool` invocation.

export { albumArtTool } from './album-art';
export { bioRefreshTool } from './bio-refresh';
export {
  getTool,
  listTools,
  registerTool,
  requireTool,
  type Tool,
  type ToolContext,
  type ToolHandlerResult,
  type ToolRetryPolicy,
  type ToolSafetyClass,
  type ToolUsageRecord,
} from './registry';
