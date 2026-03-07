#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const ROOT_PACKAGE_JSON = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
const REQUIRED_NODE_VERSION = readFileSync(join(REPO_ROOT, '.nvmrc'), 'utf8').trim();
const REQUIRED_PNPM_VERSION = ROOT_PACKAGE_JSON.packageManager.replace(/^pnpm@/, '');
const DOPPLER_PROJECT = process.env.DOPPLER_PROJECT ?? 'jovie-web';
const DOPPLER_CONFIG = process.env.DOPPLER_CONFIG ?? 'dev';
const ENV_FILE = join(REPO_ROOT, 'apps', 'web', '.env.local');
const MCP_FILE = join(REPO_ROOT, '.mcp.json');
const REQUIRED_COMMANDS = ['git', 'npx'];

const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

const style = (color, text) => (process.stdout.isTTY ? `${colors[color]}${text}${colors.reset}` : text);
const logInfo = (message) => console.log(`${style('blue', '[INFO]')} ${message}`);
const logOk = (message) => console.log(`${style('green', '[OK]')} ${message}`);
const logWarn = (message) => console.log(`${style('yellow', '[WARN]')} ${message}`);
const logError = (message) => console.error(`${style('red', '[ERROR]')} ${message}`);

function fail(message, details = []) {
  logError(message);
  for (const detail of details) {
    console.error(`  ${detail}`);
  }
  process.exit(1);
}

function parseVersion(version) {
  const cleaned = version.trim().replace(/^v/, '');
  const [major = '0', minor = '0', patch = '0'] = cleaned.split('.');
  return {
    major: Number.parseInt(major, 10) || 0,
    minor: Number.parseInt(minor, 10) || 0,
    patch: Number.parseInt(patch, 10) || 0,
  };
}

function compareVersions(left, right) {
  const a = typeof left === 'string' ? parseVersion(left) : left;
  const b = typeof right === 'string' ? parseVersion(right) : right;
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function resolveCommand(command) {
  if (process.platform !== 'win32') {
    return command;
  }

  const result = spawnSync('where', [command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (result.status !== 0) {
    return command;
  }

  const matches = (result.stdout ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const preferred =
    matches.find((line) => line.toLowerCase().endsWith('.cmd')) ||
    matches.find((line) => line.toLowerCase().endsWith('.exe')) ||
    matches.find((line) => line.toLowerCase().endsWith('.bat')) ||
    matches[0];

  return preferred || command;
}

function run(command, args = [], options = {}) {
  const executable = resolveCommand(command);
  const needsShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(executable);
  const result = spawnSync(executable, args, {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    shell: needsShell,
  });

  if (result.error) {
    if (options.allowFailure) {
      return result;
    }
    fail(`Failed to run ${command}.`, [String(result.error.message ?? result.error)]);
  }

  if (result.status !== 0 && !options.allowFailure) {
    const stderr = (result.stderr ?? '').trim();
    const stdout = (result.stdout ?? '').trim();
    fail(`${command} ${args.join(' ')} exited with status ${result.status}.`, stderr || stdout ? [stderr || stdout] : []);
  }

  return result;
}

function commandExists(command) {
  if (process.platform === 'win32') {
    const result = spawnSync('where', [command], { encoding: 'utf8', stdio: 'ignore' });
    return result.status === 0;
  }

  const result = spawnSync('which', [command], { encoding: 'utf8', stdio: 'ignore' });
  return result.status === 0;
}

function ensureNodeVersion() {
  const current = process.version;
  if (compareVersions(current, REQUIRED_NODE_VERSION) < 0) {
    const remediation =
      process.platform === 'win32'
        ? `Install Node ${REQUIRED_NODE_VERSION}+ with fnm or nvm-windows, then re-run: fnm install ${REQUIRED_NODE_VERSION} && fnm use ${REQUIRED_NODE_VERSION}`
        : `Install Node ${REQUIRED_NODE_VERSION}+ and re-run: nvm install ${REQUIRED_NODE_VERSION} && nvm use ${REQUIRED_NODE_VERSION}`;
    fail(`Node ${REQUIRED_NODE_VERSION}+ is required, found ${current}.`, [remediation]);
  }
  logOk(`Node ${current} satisfies ${REQUIRED_NODE_VERSION}+`);
}

function ensureBaseCommands() {
  for (const command of REQUIRED_COMMANDS) {
    if (!commandExists(command)) {
      fail(`Required command '${command}' is not available in PATH.`);
    }
  }
  logOk(`Verified required commands: ${REQUIRED_COMMANDS.join(', ')}`);
}

function setupPnpm() {
  logInfo(`Activating pnpm ${REQUIRED_PNPM_VERSION} via Corepack`);
  if (!commandExists('corepack')) {
    fail('corepack is not available in PATH.', [
      'Install a Node.js distribution that includes Corepack, then re-run setup.',
    ]);
  }

  run('corepack', ['enable']);
  run('corepack', ['prepare', `pnpm@${REQUIRED_PNPM_VERSION}`, '--activate']);

  if (!commandExists('pnpm')) {
    fail('pnpm is still unavailable after Corepack activation.');
  }

  const version = run('pnpm', ['--version'], { capture: true }).stdout.trim();
  if (version !== REQUIRED_PNPM_VERSION) {
    fail(`pnpm ${REQUIRED_PNPM_VERSION} is required, found ${version}.`);
  }

  logOk(`pnpm ${version} is active`);
}

function installDoppler() {
  logInfo('Doppler CLI not found. Attempting deterministic install.');

  if (process.platform === 'darwin' && commandExists('brew')) {
    run('brew', ['install', 'dopplerhq/cli/doppler']);
    return;
  }

  if (process.platform === 'linux') {
    if (commandExists('apt-get')) {
      run('sudo', ['apt-get', 'update']);
      run('sudo', ['apt-get', 'install', '-y', 'apt-transport-https', 'ca-certificates', 'curl', 'gnupg']);
      run('bash', [
        '-lc',
        "curl -sLf --retry 3 --tlsv1.2 --proto '=https' https://packages.doppler.com/public/cli/gpg.DE2A7741A397C129.key | sudo gpg --dearmor -o /usr/share/keyrings/doppler-archive-keyring.gpg",
      ]);
      run('bash', [
        '-lc',
        "echo 'deb [signed-by=/usr/share/keyrings/doppler-archive-keyring.gpg] https://packages.doppler.com/public/cli/deb/debian any-version main' | sudo tee /etc/apt/sources.list.d/doppler-cli.list > /dev/null",
      ]);
      run('sudo', ['apt-get', 'update']);
      run('sudo', ['apt-get', 'install', '-y', 'doppler']);
      return;
    }

    fail('Doppler CLI is missing and auto-install is unsupported on this Linux distribution.', [
      'Install it manually with: curl -Ls --tlsv1.2 --proto "=https" --retry 3 https://cli.doppler.com/install.sh | sh',
    ]);
  }

  if (process.platform === 'win32' && commandExists('winget')) {
    run('winget', ['install', '--id', 'DopplerHQ.Doppler', '-e', '--accept-package-agreements', '--accept-source-agreements']);
    return;
  }

  const installCommand =
    process.platform === 'win32'
      ? 'winget install --id DopplerHQ.Doppler -e'
      : process.platform === 'darwin'
        ? 'brew install dopplerhq/cli/doppler'
        : 'curl -Ls --tlsv1.2 --proto "=https" --retry 3 https://cli.doppler.com/install.sh | sh';

  fail('Doppler CLI is required but could not be installed automatically.', [
    `Install it manually, then re-run setup: ${installCommand}`,
  ]);
}

function ensureDoppler() {
  if (!commandExists('doppler')) {
    installDoppler();
  }

  if (!commandExists('doppler')) {
    fail('Doppler CLI is still unavailable after installation attempt.');
  }

  if (!process.env.DOPPLER_TOKEN?.trim()) {
    fail('DOPPLER_TOKEN is required for Codex setup.', [
      `Create a service token for ${DOPPLER_PROJECT}/${DOPPLER_CONFIG} and export DOPPLER_TOKEN before running this script.`,
    ]);
  }

  const version = run('doppler', ['--version'], { capture: true }).stdout.trim();
  logOk(`Doppler CLI detected (${version})`);

  run('doppler', ['setup', '--project', DOPPLER_PROJECT, '--config', DOPPLER_CONFIG, '--no-interactive']);
  run('doppler', [
    'secrets',
    'download',
    '--project',
    DOPPLER_PROJECT,
    '--config',
    DOPPLER_CONFIG,
    '--no-file',
    '--format',
    'env-no-quotes',
  ]);
  logOk(`Validated Doppler access for ${DOPPLER_PROJECT}/${DOPPLER_CONFIG}`);
}

function generateEnvLocal() {
  logInfo('Generating apps/web/.env.local from Doppler');
  const secrets = run(
    'doppler',
    [
      'secrets',
      'download',
      '--project',
      DOPPLER_PROJECT,
      '--config',
      DOPPLER_CONFIG,
      '--no-file',
      '--format',
      'env-no-quotes',
    ],
    { capture: true },
  ).stdout;

  if (!secrets.trim()) {
    fail('Doppler returned no secrets for apps/web/.env.local generation.');
  }

  mkdirSync(dirname(ENV_FILE), { recursive: true });
  const tempFile = `${ENV_FILE}.tmp`;
  const content = [
    `# Generated by scripts/codex-setup.mjs from Doppler (${DOPPLER_PROJECT}/${DOPPLER_CONFIG})`,
    '# Re-run the setup script to refresh local secrets.',
    '',
    secrets.trimEnd(),
    '',
  ].join('\n');

  writeFileSync(tempFile, content, 'utf8');
  renameSync(tempFile, ENV_FILE);

  const variableCount = content
    .split('\n')
    .filter((line) => line && !line.startsWith('#') && line.includes('=')).length;

  if (variableCount === 0) {
    rmSync(ENV_FILE, { force: true });
    fail('apps/web/.env.local was generated without any key/value pairs.');
  }

  logOk(`Generated apps/web/.env.local with ${variableCount} variables`);
}

function installDependencies() {
  logInfo('Installing workspace dependencies');
  const frozen = run('pnpm', ['install', '--frozen-lockfile'], { allowFailure: true });
  if (frozen.status !== 0) {
    logWarn('pnpm install --frozen-lockfile failed, retrying without --frozen-lockfile');
    run('pnpm', ['install']);
  }
  logOk('Dependencies installed');
}

function normalizeMcpConfig() {
  logInfo('Normalizing MCP server command configuration');
  const mcpConfig = JSON.parse(readFileSync(MCP_FILE, 'utf8'));
  const servers = mcpConfig.mcpServers ?? {};
  const normalizedServers = {};

  for (const [name, config] of Object.entries(servers)) {
    const nextConfig = { ...config };
    if (typeof nextConfig.command === 'string') {
      const command = nextConfig.command.replace(/\\/g, '/');
      const pieces = command.split('/');
      const leaf = pieces[pieces.length - 1].toLowerCase();

      if (command.includes('/') && leaf !== 'npx' && leaf !== 'npx.cmd' && leaf !== 'npx.exe') {
        fail(`MCP server '${name}' uses a non-portable absolute command path.`, [
          `Unsupported command: ${nextConfig.command}`,
          'Replace it with a PATH-based command before re-running setup.',
        ]);
      }

      if (leaf === 'npx' || leaf === 'npx.cmd' || leaf === 'npx.exe') {
        nextConfig.command = 'npx';
      }
    }
    normalizedServers[name] = nextConfig;
  }

  writeFileSync(MCP_FILE, `${JSON.stringify({ ...mcpConfig, mcpServers: normalizedServers }, null, 2)}\n`, 'utf8');
  logOk('MCP server commands are portable');
}

function verifySetup() {
  const nodeVersion = process.version;
  const pnpmVersion = run('pnpm', ['--version'], { capture: true }).stdout.trim();
  const dopplerVersion = run('doppler', ['--version'], { capture: true }).stdout.trim();
  const turboVersion = run('pnpm', ['exec', 'turbo', '--version'], { capture: true }).stdout.trim();
  const envContent = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : '';
  const envCount = envContent
    .split('\n')
    .filter((line) => line && !line.startsWith('#') && line.includes('=')).length;
  const mcpConfig = JSON.parse(readFileSync(MCP_FILE, 'utf8'));

  for (const [name, config] of Object.entries(mcpConfig.mcpServers ?? {})) {
    if (typeof config.command === 'string' && /^(\/|[A-Za-z]:\\)/.test(config.command) && !/npx(\.cmd|\.exe)?$/i.test(config.command)) {
      fail(`Verification failed: MCP server '${name}' still has a machine-specific command path.`, [
        `Command: ${config.command}`,
      ]);
    }
  }

  const statuses = [
    ['Node.js', nodeVersion],
    ['pnpm', pnpmVersion],
    ['Doppler', `${dopplerVersion} with ${DOPPLER_PROJECT}/${DOPPLER_CONFIG}`],
    ['.env.local', `${envCount} variables`],
    ['Dependencies', 'pnpm install completed'],
    ['Turbo', turboVersion],
    ['MCP config', 'portable commands verified'],
  ];

  console.log('\nSetup verification');
  console.log('------------------');
  for (const [label, value] of statuses) {
    console.log(`${label.padEnd(12, ' ')} ${value}`);
  }
}

function main() {
  console.log('\nJovie Codex bootstrap\n');
  ensureNodeVersion();
  ensureBaseCommands();
  setupPnpm();
  ensureDoppler();
  generateEnvLocal();
  installDependencies();
  normalizeMcpConfig();
  verifySetup();
  console.log('\nSetup complete.\n');
}

main();
