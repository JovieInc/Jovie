const DESIGN_GOVERNANCE_PATHS = new Set([
  '.github/workflows/ci.yml',
  'DESIGN.md',
  'docs/design-system/design-conformance-manifest.json',
  'scripts/agent/pen-workspace-locks.json',
  'scripts/design-conformance-check.mjs',
  'scripts/design-conformance-check.test.mjs',
  'scripts/design-conformance-paths.mjs',
  'scripts/ci-fast-lanes.mjs',
  'scripts/lib/__tests__/ci-fast-workflow-contract.test.mjs',
  'package.json',
]);

const DESIGN_PREFIX_RULES = Object.freeze([
  ['web', 'apps/web/app/'],
  ['web', 'apps/web/components/'],
  ['web', 'apps/web/styles/'],
  ['web', 'packages/ui/'],
  ['ios', 'apps/ios/'],
  ['macos', 'apps/macos/'],
  ['motion', 'apps/video/'],
  ['motion', 'packages/hyperframes/'],
  ['motion', 'scripts/hyperframes/'],
]);

const DESIGN_FILE_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.jsx',
  '.json',
  '.mjs',
  '.scss',
  '.swift',
  '.ts',
  '.tsx',
  '.xcassets',
]);

const UBUNTU_OPERATIONS_PREFIXES = Object.freeze([
  'scripts/backlog-orchestrator/',
  'scripts/hermes/',
]);

function normalizePath(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replaceAll('\\', '/').replace(/^\.\//, '');
  if (
    normalized === '' ||
    normalized.startsWith('/') ||
    normalized.includes('../') ||
    normalized === '..'
  ) {
    return null;
  }
  return normalized;
}

function extensionFor(relativePath) {
  const assetCatalogIndex = relativePath.indexOf('.xcassets/');
  if (assetCatalogIndex !== -1 || relativePath.endsWith('.xcassets')) {
    return '.xcassets';
  }
  const slash = relativePath.lastIndexOf('/');
  const dot = relativePath.lastIndexOf('.');
  return dot > slash ? relativePath.slice(dot).toLowerCase() : '';
}

export function classifyDesignPath(value) {
  const relativePath = normalizePath(value);
  if (!relativePath) {
    return { valid: false, path: value, domains: [] };
  }

  const domains = new Set();
  if (DESIGN_GOVERNANCE_PATHS.has(relativePath)) domains.add('governance');

  const extension = extensionFor(relativePath);
  if (DESIGN_FILE_EXTENSIONS.has(extension)) {
    for (const [domain, prefix] of DESIGN_PREFIX_RULES) {
      if (relativePath.startsWith(prefix)) domains.add(domain);
    }
  }

  if (
    relativePath === 'scripts/generate-footer-cta-video.ts' ||
    relativePath === 'packages/ui/theme/motion-policy.ts'
  ) {
    domains.add('motion');
  }

  return {
    valid: true,
    path: relativePath,
    domains: [...domains].sort(),
  };
}

export function selectDesignConformanceChecks(changedFiles) {
  if (!Array.isArray(changedFiles)) {
    throw new TypeError('changedFiles must be an array');
  }

  const invalidPaths = [];
  const selectedPaths = [];
  const domains = new Set();
  let ubuntuOperationsAffected = false;

  for (const value of changedFiles) {
    const classified = classifyDesignPath(value);
    if (!classified.valid) {
      invalidPaths.push(value);
      continue;
    }
    if (
      UBUNTU_OPERATIONS_PREFIXES.some(prefix =>
        classified.path.startsWith(prefix)
      )
    ) {
      ubuntuOperationsAffected = true;
    }
    if (classified.domains.length > 0) {
      selectedPaths.push(classified.path);
      for (const domain of classified.domains) domains.add(domain);
    }
  }

  return {
    applicable: selectedPaths.length > 0,
    domains: [...domains].sort(),
    selectedPaths: [...new Set(selectedPaths)].sort(),
    invalidPaths,
    ubuntuOperationsAffected,
  };
}
