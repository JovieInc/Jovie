import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pilot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const common = [
  'scripts/check-built-app.mjs',
  'package.json',
  'pnpm-lock.yaml',
  'tsconfig.json',
  '.gitignore',
  'agent/channels/photon.ts',
  'agent/lib/imessage-allowlist.ts',
];
const summer = [
  'tests/transport-version-compatibility.test.ts',
  'agent/channels/summer-shadow.ts',
  'agent/channels/summer-bottleneck.ts',
  'agent/channels/telegram.ts',
  'agent/lib/telegram-allowlist.ts',
  'agent/instructions/summer-shadow.ts',
  'agent/schedules/summer-bottleneck-heartbeat.ts',
  ...[
    'summer-bottleneck-loop',
    'summer-commercial-projection',
    'summer-commercial-readback',
    'summer-photon-offline-proof',
    'summer-shadow-ingress',
    'vercel-blob-bottleneck-runtime',
    'vercel-blob-shadow-store',
  ].map(name => `agent/lib/${name}.ts`),
  ...[
    'summer-bottleneck-auth',
    'summer-bottleneck-heartbeat',
    'summer-bottleneck-loop',
    'summer-commercial-integration',
    'summer-commercial-projection',
    'summer-photon-offline-proof',
    'summer-shadow-auth',
    'summer-shadow-identity',
    'summer-shadow-ingress',
    'telegram-fallback',
    'vercel-blob-bottleneck-runtime',
    'vercel-blob-shadow-store',
  ].map(name => `tests/${name}.test.ts`),
  'tests/commercial-fixture.ts',
];
const jovie = [
  'scripts/jovie-release.mjs',
  'tests/jovie-release.test.ts',
  'agent/channels/eve.ts',
  'agent/tools/jovie_capability_manifest.ts',
  'agent/skills/jovie-action-boundary.md',
  'tests/eve-channel-auth-contract.test.ts',
  'tests/jovie_capability_manifest.test.ts',
];
export const disabledTools = [
  'agent',
  'ask_question',
  'bash',
  'read_file',
  'write_file',
  'todo',
  'web_fetch',
  'web_search',
  'load_skill',
  'connection_search',
  'task_update',
  'task_cancel',
];

/** A one-time, explicit source export. Never reads runtime state or overwrites a destination. */
export function materializeApp(identity, destination, source = pilot) {
  if (!['jovie', 'summer'].includes(identity))
    throw new Error('unknown application identity');
  if (existsSync(destination)) throw new Error('destination must not exist');
  const paths = [
    ...common,
    ...(identity === 'summer' ? summer : jovie),
    `identities/${identity}/instructions.md`,
  ];
  const files = new Map(
    paths.map(path => [path, readFileSync(resolve(source, path), 'utf8')])
  );
  const put = (path, text) => files.set(path, text);
  const manifest = JSON.parse(files.get('package.json'));
  manifest.name =
    identity === 'summer' ? '@jovieinc/summer-runtime' : '@jovie/jovie-agent';
  manifest.private = true;
  if (identity === 'jovie') manifest.scripts.release = 'node scripts/jovie-release.mjs';
  manifest.scripts['test:built'] =
    `node scripts/check-built-app.mjs ${identity}`;
  manifest.scripts['test:coverage'] =
    'vitest run --config vitest.config.ts --coverage';
  delete manifest.scripts.deploy;
  delete manifest.scripts.smoke;
  put('package.json', `${JSON.stringify(manifest, null, 2)}\n`);
  put(
    'agent/runtime-identity.ts',
    `export const APPLICATION_IDENTITY = '${identity}' as 'jovie' | 'summer';\n`
  );
  put(
    'agent/agent.ts',
    `import { defineAgent } from 'eve';
import { assertRuntimeEnvironment } from './lib/application-boundary';
assertRuntimeEnvironment();
export default defineAgent({ model: 'zai/glm-5.3-flash' });\n`
  );
  put(
    'agent/channels/runtime-health.ts',
    `import { defineChannel, GET } from 'eve/channels';
import { APPLICATION_IDENTITY } from '../runtime-identity';
import { bindEvePilotIdentity } from '../select-identity';
export default defineChannel({ routes: [GET('/runtime/v1/health', async () => {
  const identity = bindEvePilotIdentity(APPLICATION_IDENTITY);
  return Response.json({ identity: identity.pack.id, status: 'uncommissioned',
    instructionsAvailable: identity.instructions.length > 0 }, { headers: { 'cache-control': 'no-store' } });
})] });\n`
  );
  put(
    'agent/identity-instructions.ts',
    `export const IDENTITY_INSTRUCTIONS = ${JSON.stringify(files.get(`identities/${identity}/instructions.md`))};\n`
  );
  put(
    'agent/instructions.md',
    files.get(`identities/${identity}/instructions.md`)
  );
  put(
    'agent/select-identity.ts',
    readFileSync(resolve(pilot, 'scripts/templates/select-identity.ts'), 'utf8')
  );
  put(
    'agent/lib/application-boundary.ts',
    readFileSync(
      resolve(pilot, 'scripts/templates/application-boundary.ts'),
      'utf8'
    )
  );
  for (const tool of disabledTools)
    put(
      `agent/tools/${tool}.ts`,
      "import { disableTool } from 'eve/tools';\nexport default disableTool();\n"
    );
  put(
    'agent/channels/home.ts',
    "import { disableRoute } from 'eve/channels';\nexport default disableRoute();\n"
  );
  if (identity === 'summer') {
    put(
      'agent/channels/eve.ts',
      "import { disableRoute } from 'eve/channels';\nexport default disableRoute();\n"
    );
    // Older signed producers may still request the product manifest. Preserve the
    // wire contract but never ask the company agent to execute a product tool.
    put(
      'agent/lib/summer-shadow-ingress.ts',
      files
        .get('agent/lib/summer-shadow-ingress.ts')
        .replace(
          'Call exactly jovie_capability_manifest once with capability ${event.requestedCapability}, then acknowledge the read-only result. Do not call any other tool.',
          'Product capability ${event.requestedCapability} is unavailable in Summer. Report that limitation without calling tools.'
        )
    );
    put(
      'tests/summer-shadow-ingress.test.ts',
      files
        .get('tests/summer-shadow-ingress.test.ts')
        .replace(
          'Call exactly jovie_capability_manifest once with capability core_chat',
          'Product capability core_chat is unavailable in Summer'
        )
        .replace('Do not call any other tool', 'without calling tools')
    );
    const store = files.get('agent/lib/vercel-blob-shadow-store.ts');
    put(
      'agent/lib/vercel-blob-shadow-store.ts',
      "import { summerStoreToken } from './application-boundary';\n" +
        store.replaceAll(
          'abortSignal: AbortSignal.timeout(BLOB_OPERATION_TIMEOUT_MS),',
          'token: summerStoreToken(),\n      abortSignal: AbortSignal.timeout(BLOB_OPERATION_TIMEOUT_MS),'
        )
    );
    // Keep the existing test runner and coverage floors for migrated business logic.
    put(
      'vitest.config.ts',
      readFileSync(resolve(source, 'vitest.config.ts'), 'utf8')
        .replace("'scripts/materialize-app.mjs',", '')
        .replace("'scripts/jovie-release.mjs',", '')
        .replace(
          '../../packages/agent-transport-contracts/index.ts',
          'vendor/agent-transport-contracts/index.ts'
        )
        .replace(
          "'agent/instructions/summer-shadow.ts',",
          "'agent/lib/application-boundary.ts',\n        'agent/select-identity.ts',\n        'agent/instructions/summer-shadow.ts',"
        )
    );
    put(
      'tests/setup.ts',
      "import { beforeEach, vi } from 'vitest';\nbeforeEach(() => vi.stubEnv('SUMMER_BLOB_READ_WRITE_TOKEN', 'isolated-test-store'));\n"
    );
  } else {
    put(
      'vitest.config.ts',
      `import { defineConfig } from 'vitest/config';
export default defineConfig({test: {include: ['tests/**/*.test.ts'], environment: 'node',
coverage: {provider: 'v8', include: ['agent/lib/application-boundary.ts', 'agent/select-identity.ts',
'agent/channels/eve.ts', 'agent/tools/jovie_capability_manifest.ts', 'scripts/jovie-release.mjs'], reporter: ['text', 'json-summary'],
thresholds: {statements: 85, branches: 75, functions: 85, lines: 85}}}});\n`
    );
  }
  if (identity === 'summer')
    put(
      'vitest.config.ts',
      files
        .get('vitest.config.ts')
        .replace('test: {', "test: {\n    setupFiles: ['tests/setup.ts'],")
    );
  put(
    'tests/application-boundary.test.ts',
    readFileSync(
      resolve(pilot, 'scripts/templates/application-boundary.test.ts'),
      'utf8'
    )
  );
  put(
    'AGENTS.md',
    `# ${identity} Eve application\n\nRead the installed Eve docs before editing. This application has one fixed identity.
Run Node 24 and pnpm 9.15.4: install --ignore-workspace --frozen-lockfile; run typecheck;
run test:coverage; run build. Preserve authentication, recipient containment, and durable replay protection.
No credentials, logs, sessions, memory, or profiles belong in Git. No external messages for validation.
The source export is preparatory; deployment and commissioning require separate receipts.\n`
  );
  if (identity === 'summer') {
    put(
      'tests/telegram-fallback.test.ts',
      files
        .get('tests/telegram-fallback.test.ts')
        .replace(
          "expect(eveIdentityForChannel('jovie-core-chat').pack.id).toBe('jovie');",
          "expect(() => eveIdentityForChannel('jovie-core-chat')).toThrow('cross-domain');"
        )
    );
    put(
      'tests/summer-bottleneck-auth.test.ts',
      files
        .get('tests/summer-bottleneck-auth.test.ts')
        .replace(
          '../../../packages/agent-transport-contracts/index',
          '../vendor/agent-transport-contracts/index'
        )
    );
    for (const path of ['index.ts', 'package.json'])
      put(
        `vendor/agent-transport-contracts/${path}`,
        readFileSync(
          resolve(pilot, '../../packages/agent-transport-contracts', path),
          'utf8'
        )
      );
  }
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: source,
    encoding: 'utf8',
  }).trim();
  const hash = text => ({ sha256: createHash('sha256').update(text).digest('hex') });
  const inputs = [
    'vitest.config.ts',
    'scripts/materialize-app.mjs',
    'scripts/templates/select-identity.ts',
    'scripts/templates/application-boundary.ts',
    'scripts/templates/application-boundary.test.ts',
    '../../packages/agent-transport-contracts/index.ts',
    '../../packages/agent-transport-contracts/package.json',
  ];
  const provenance = {
    schema: 'jovie.agent-extraction/v1',
    identity,
    sourceRepository: 'JovieInc/Jovie',
    sourceCommit: commit,
    transformationInputs: Object.fromEntries(
      inputs.map(path => [path, hash(readFileSync(resolve(pilot, path)))])
    ),
    sourceWorktreeStatus: execFileSync(
      'git',
      [
        'status',
        '--porcelain',
        '--',
        'apps/eve-pilot',
        'packages/agent-transport-contracts',
      ],
      {
        cwd: resolve(source, '../..'),
        encoding: 'utf8',
      }
    ).trim(),
    sourcePaths: Object.fromEntries(
      paths.map(path => [path, hash(readFileSync(resolve(source, path)))])
    ),
    files: Object.fromEntries(
      [...files].map(([path, text]) => [path, hash(text)])
    ),
    contracts: {
      shadow: 'jovie.ovie-summer-shadow.event/v1',
      commercial: 'jovie.summer-commercial.snapshot/v1',
    },
    status: 'prepared-not-commissioned',
  };
  put('extraction-provenance.json', `${JSON.stringify(provenance, null, 2)}\n`);
  mkdirSync(dirname(resolve(destination)), { recursive: true });
  mkdirSync(destination);
  for (const [path, text] of files) {
    mkdirSync(dirname(resolve(destination, path)), { recursive: true });
    writeFileSync(resolve(destination, path), text);
  }
  return provenance;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length !== 4)
    throw new Error(
      'usage: node materialize-app.mjs jovie|summer NEW_DESTINATION'
    );
  const result = materializeApp(process.argv[2], resolve(process.argv[3]));
  console.log(
    JSON.stringify({
      identity: result.identity,
      sourceCommit: result.sourceCommit,
      files: Object.keys(result.files).length,
      status: result.status,
    })
  );
}
