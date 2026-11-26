import { describe, expect, it } from 'vitest';
import { SOURCE_GUARDS, selectSourceGuards } from '../../ci-fast-lanes.mjs';

// Split from ci-fast-lanes.test.mjs to keep that file under its size budget.
describe('public command/OpenAPI parity guard selection', () => {
  const selected = (event, files) =>
    selectSourceGuards(event, files).map(guard => guard.id);

  it.each([
    'apps/web/app/api/agents/creator-lookup/route.ts',
    'apps/web/app/api/agents/feedback/route.ts',
    'apps/web/app/api/agents/profiles/route.ts',
    'apps/web/app/api/music/mcp/route.ts',
    'apps/web/app/api/v1/openapi.json/route.ts',
    'apps/web/app/openapi.json/route.ts',
    'apps/web/lib/api/public-agent-openapi.ts',
    'apps/web/lib/api/v1/openapi.ts',
    'apps/web/lib/music-resolver/public-schemas.ts',
    'apps/web/tests/unit/api/v1/public-command-openapi.test.ts',
    'apps/web/tests/utils/public-openapi.ts',
    'packages/jovie-cli/src/client.ts',
    'packages/jovie-cli/src/commands.ts',
    'packages/jovie-cli/src/mcp.ts',
  ])('runs public command/OpenAPI parity on PR changes to %s', path => {
    expect(selected('pull_request', [path])).toContain(
      'public-command-openapi'
    );
    expect(selected('merge_group', [path])).not.toContain(
      'public-command-openapi'
    );
    expect(
      SOURCE_GUARDS.find(guard => guard.id === 'public-command-openapi').command
    ).toContain('public-command-openapi.test.ts');
  });
});
