import { defineConfig } from 'vitest/config';
export default defineConfig({test: {include: ['tests/**/*.test.ts'], environment: 'node',
coverage: {provider: 'v8', include: ['agent/lib/application-boundary.ts', 'agent/select-identity.ts',
'agent/channels/eve.ts', 'agent/tools/jovie_capability_manifest.ts', 'scripts/jovie-release.mjs'], reporter: ['text', 'json-summary'],
thresholds: {statements: 85, branches: 75, functions: 85, lines: 85}}}});
