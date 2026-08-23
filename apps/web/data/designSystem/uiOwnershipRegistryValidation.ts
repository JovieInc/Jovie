import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { APP_SCREEN_COMPONENT_REGISTRY } from '@/data/appScreens';
import { MARKETING_SHELL_REGISTRY } from '@/data/marketing';
import { DESIGN_SYSTEM_COMPONENT_REGISTRY } from './componentRegistry';
import {
  UI_OWNERSHIP_BREAKPOINTS,
  UI_OWNERSHIP_ENTRY_IDS,
  UI_OWNERSHIP_PLATFORMS,
  UI_OWNERSHIP_REGISTRY,
  UI_OWNERSHIP_STATES,
  UI_OWNERSHIP_SURFACES,
  type UINativeAdapterBinding,
  type UIOwnershipRegistryEntry,
} from './uiOwnershipRegistry';

export type UIOwnershipRegistryIssue = {
  readonly code: string;
  readonly id: string;
};
export type UINativeSwiftSource = {
  readonly path: string;
  readonly source: string;
};
const REQUIRED_NATIVE_BUTTON_BINDINGS = [
  ['atom.button', 'JoviePillButtonStyle', 'pill-action'],
  [
    'atom.button',
    'JoviePressFeedbackButtonStyle',
    'plain-content-press-feedback',
  ],
  ['atom.icon-button', 'JovieIconButtonStyle', 'icon-action'],
] as const;
const appExports = Object.fromEntries(
  'component.app-shell-frame=AppShellFrame;component.app-shell-content-panel=AppShellContentPanel;component.settings-panel=SettingsPanel;component.unified-table=UnifiedTable;component.entity-sidebar=EntitySidebarShell;component.empty-state=EmptyState;component.error-fallback=DashboardErrorFallback'
    .split(';')
    .map(item => item.split('='))
) as Readonly<Record<string, string>>;
const has = (value?: string | null) => Boolean(value?.trim());
const decodeToken = (codes: readonly number[]) => String.fromCharCode(...codes);
const DISALLOWED_TYPEFACE_TOKENS = [
  [115, 101, 114, 105, 102],
  [103, 101, 111, 114, 103, 105, 97],
  [116, 105, 109, 101, 115],
  [103, 97, 114, 97, 109, 111, 110, 100],
  [98, 97, 115, 107, 101, 114, 118, 105, 108, 108, 101],
  [100, 105, 100, 111, 116],
  [112, 97, 108, 97, 116, 105, 110, 111],
].map(decodeToken);
const hasDisallowedTypefaceToken = (value: string) => {
  const normalized = value.toLowerCase();
  return DISALLOWED_TYPEFACE_TOKENS.some(token => normalized.includes(token));
};
const bad = (issues: UIOwnershipRegistryIssue[], code: string, id: string) =>
  issues.push({ code, id });
const badEntry = (
  issues: UIOwnershipRegistryIssue[],
  entry: UIOwnershipRegistryEntry,
  code: string
) => bad(issues, code, entry.id);

const toRepoPath = (value: string) => value.split('\\').join('/');
const findRepoRoot = (start: string): string | null => {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, 'apps/ios/Jovie'))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
};
const collectSwiftSources = (
  directory: string,
  repoRoot: string,
  sources: UINativeSwiftSource[]
) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectSwiftSources(absolutePath, repoRoot, sources);
    } else if (entry.isFile() && entry.name.endsWith('.swift')) {
      sources.push({
        path: toRepoPath(relative(repoRoot, absolutePath)),
        source: readFileSync(absolutePath, 'utf8'),
      });
    }
  }
};
export const loadProductionSwiftSources = (
  start = process.cwd()
): readonly UINativeSwiftSource[] => {
  const repoRoot = findRepoRoot(start);
  if (!repoRoot) return [];
  const sources: UINativeSwiftSource[] = [];
  collectSwiftSources(join(repoRoot, 'apps/ios/Jovie'), repoRoot, sources);
  return sources.sort((left, right) => left.path.localeCompare(right.path));
};

type SwiftButtonStyleDeclaration = {
  readonly path: string;
  readonly name: string;
  readonly isFilePrivate: boolean;
  readonly body: string;
};
const swiftDeclarationPattern =
  /(?:@[_A-Za-z][_A-Za-z0-9]*(?:\([^)]*\))?\s*)*(?<modifiers>(?:(?:open|public|package|internal|private|fileprivate|final|nonisolated)\s+)*)(?:struct|class|enum|extension)\s+(?<name>[A-Za-z_][A-Za-z0-9_]*)(?:\s*<[^>{}]*>)?\s*:\s*(?<inheritance>[^{}]+)\{/g;
const maskSwiftNonCode = (source: string): string => {
  const masked = source.split('');
  let cursor = 0;
  let blockCommentDepth = 0;
  let stringEnd: string | null = null;
  let stringIsRaw = false;
  const blank = (start: number, length = 1) => {
    for (let offset = 0; offset < length; offset += 1) {
      if (masked[start + offset] !== '\n') masked[start + offset] = ' ';
    }
  };

  while (cursor < source.length) {
    if (blockCommentDepth > 0) {
      if (source.startsWith('/*', cursor)) {
        blockCommentDepth += 1;
        blank(cursor, 2);
        cursor += 2;
      } else if (source.startsWith('*/', cursor)) {
        blockCommentDepth -= 1;
        blank(cursor, 2);
        cursor += 2;
      } else {
        blank(cursor);
        cursor += 1;
      }
      continue;
    }
    if (stringEnd) {
      if (source.startsWith(stringEnd, cursor)) {
        blank(cursor, stringEnd.length);
        cursor += stringEnd.length;
        stringEnd = null;
      } else if (!stringIsRaw && source[cursor] === '\\') {
        blank(cursor, Math.min(2, source.length - cursor));
        cursor += 2;
      } else {
        blank(cursor);
        cursor += 1;
      }
      continue;
    }
    if (source.startsWith('//', cursor)) {
      const lineEnd = source.indexOf('\n', cursor);
      const length = (lineEnd === -1 ? source.length : lineEnd) - cursor;
      blank(cursor, length);
      cursor += length;
      continue;
    }
    if (source.startsWith('/*', cursor)) {
      blockCommentDepth = 1;
      blank(cursor, 2);
      cursor += 2;
      continue;
    }
    const stringStart = source.slice(cursor).match(/^(#+)?("""|")/);
    if (stringStart) {
      const hashes = stringStart[1] ?? '';
      const quote = stringStart[2];
      stringEnd = `${quote}${hashes}`;
      stringIsRaw = hashes.length > 0;
      blank(cursor, stringStart[0].length);
      cursor += stringStart[0].length;
      continue;
    }
    cursor += 1;
  }

  return masked.join('');
};
const swiftButtonStyleDeclarations = (
  swiftSources: readonly UINativeSwiftSource[]
): readonly SwiftButtonStyleDeclaration[] => {
  const declarations: SwiftButtonStyleDeclaration[] = [];
  for (const swiftSource of swiftSources) {
    const code = maskSwiftNonCode(swiftSource.source);
    for (const match of code.matchAll(swiftDeclarationPattern)) {
      const inheritance = match.groups?.inheritance ?? '';
      if (
        !/(?:^|,)\s*(?:SwiftUI\.)?(?:ButtonStyle|PrimitiveButtonStyle)\s*(?:,|$)/.test(
          inheritance
        )
      ) {
        continue;
      }
      const openingBrace = (match.index ?? 0) + match[0].length - 1;
      let depth = 1;
      let cursor = openingBrace + 1;
      while (cursor < code.length && depth > 0) {
        if (code[cursor] === '{') depth += 1;
        if (code[cursor] === '}') depth -= 1;
        cursor += 1;
      }
      declarations.push({
        path: swiftSource.path,
        name: match.groups?.name ?? '',
        isFilePrivate: /\b(?:private|fileprivate)\b/.test(
          match.groups?.modifiers ?? ''
        ),
        body: code.slice(openingBrace + 1, cursor - 1),
      });
    }
  }
  return declarations;
};
const swiftFunctionBody = (body: string, functionName: string): string => {
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(
    `\\bfunc\\s+${escapedName}\\s*\\([^)]*\\)[^{]*\\{`
  ).exec(body);
  if (!match) return '';
  const openingBrace = (match.index ?? 0) + match[0].length - 1;
  let depth = 1;
  let cursor = openingBrace + 1;
  while (cursor < body.length && depth > 0) {
    if (body[cursor] === '{') depth += 1;
    if (body[cursor] === '}') depth -= 1;
    cursor += 1;
  }
  return depth === 0 ? body.slice(openingBrace + 1, cursor - 1) : '';
};
const ownsCanonicalPressRecipe = (declarationBody: string) => {
  const body = swiftFunctionBody(declarationBody, 'makeBody');
  return (
    /\.opacity\s*\(\s*configuration\.isPressed\s*\?/.test(body) &&
    /\.scaleEffect\s*\(\s*configuration\.isPressed\s*\?\s*JovieMotion\.pressScale\s*:\s*1\s*\)/.test(
      body
    ) &&
    /\.animation\s*\(\s*JovieMotion\.subtle\s*,\s*value:\s*configuration\.isPressed\s*\)/.test(
      body
    )
  );
};
const ownsRegisteredNativeRecipe = (
  declaration: SwiftButtonStyleDeclaration,
  binding: UINativeAdapterBinding
) => {
  if (!ownsCanonicalPressRecipe(declaration.body)) return false;
  const body = swiftFunctionBody(declaration.body, 'makeBody');
  if (binding.semanticRole === 'pill-action') {
    return /\.opacity\s*\(\s*configuration\.isPressed\s*\?\s*JoviePillButtonStyle\.pressedOpacity\s*:\s*1\s*\)/.test(
      body
    );
  }
  if (binding.semanticRole === 'icon-action') {
    return (
      /\.opacity\s*\(\s*configuration\.isPressed\s*\?\s*JovieIconButtonStyle\.pressedOpacity\s*:\s*1\s*\)/.test(
        body
      ) &&
      /width:\s*JovieIconButtonStyle\.targetSize/.test(body) &&
      /height:\s*JovieIconButtonStyle\.targetSize/.test(body)
    );
  }
  return /\.opacity\s*\(\s*configuration\.isPressed\s*\?\s*pressedOpacity\s*:\s*1\s*\)/.test(
    body
  );
};
const nativeBindingsFor = (entries: readonly UIOwnershipRegistryEntry[]) =>
  entries.flatMap(entry =>
    entry.platformAdapters.flatMap(adapterEntry =>
      (adapterEntry.nativeBindings ?? []).map(binding => ({ entry, binding }))
    )
  );
const bindingReferencePattern = (binding: UINativeAdapterBinding) =>
  new RegExp(
    `\\b${binding.swiftType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`
  );
const nativeTestAssertionPatterns = (
  binding: UINativeAdapterBinding
): readonly RegExp[] => {
  if (binding.semanticRole === 'pill-action') {
    return [/JoviePillButtonStyle\.pressedOpacity\s*==\s*0\.8\b/];
  }
  if (binding.semanticRole === 'icon-action') {
    return [
      /JovieIconButtonStyle\.pressedOpacity\s*==\s*0\.72\b/,
      /JovieIconButtonStyle\.targetSize\s*==\s*44\b/,
    ];
  }
  return [
    /JoviePressFeedbackButtonStyle\.defaultPressedOpacity\s*==\s*0\.72\b/,
  ];
};
const testIsInNativeTarget = (repoRoot: string, testPath: string): boolean => {
  const projectPath = resolve(
    repoRoot,
    'apps/ios/Jovie.xcodeproj/project.pbxproj'
  );
  if (!existsSync(projectPath)) return false;
  const fileName = testPath.split('/').at(-1);
  if (!fileName) return false;
  const escapedFileName = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const project = readFileSync(projectPath, 'utf8');
  const testTarget = project.match(
    /[A-F0-9]+ \/\* JovieTests \*\/ = \{\s*isa = PBXNativeTarget;([\s\S]*?)\n\t\t\};/
  );
  const buildFile = project.match(
    new RegExp(
      `([A-F0-9]+) /\\* ${escapedFileName} in Sources \\*/ = \\{isa = PBXBuildFile;`
    )
  );
  const testSourcePhaseId = testTarget?.[1].match(
    /buildPhases = \([\s\S]*?([A-F0-9]+) \/\* Sources \*\//
  )?.[1];
  if (!testSourcePhaseId || !buildFile?.[1]) return false;
  const sourcePhase = project.match(
    new RegExp(
      `${testSourcePhaseId} /\\* Sources \\*/ = \\{[\\s\\S]*?isa = PBXSourcesBuildPhase;[\\s\\S]*?files = \\(([\\s\\S]*?)\\);`
    )
  );
  return Boolean(
    sourcePhase?.[1].includes(`${buildFile[1]} /* ${fileName} in Sources */`)
  );
};

function validateNativeButtonOwnership(
  entries: readonly UIOwnershipRegistryEntry[],
  swiftSources: readonly UINativeSwiftSource[],
  issues: UIOwnershipRegistryIssue[],
  repoRoot: string | null
) {
  const bindings = nativeBindingsFor(entries);
  for (const [
    entryId,
    swiftType,
    semanticRole,
  ] of REQUIRED_NATIVE_BUTTON_BINDINGS) {
    if (
      !bindings.some(
        ({ entry, binding }) =>
          entry.id === entryId &&
          binding.swiftType === swiftType &&
          binding.semanticRole === semanticRole
      )
    ) {
      bad(issues, 'missing-native-binding', `${entryId}:${swiftType}`);
    }
  }
  if (!bindings.length) return;
  if (!swiftSources.length) {
    bad(issues, 'native-source-unavailable', 'ios');
    return;
  }
  const declarations = swiftButtonStyleDeclarations(swiftSources);
  const declarationsByName = new Map<string, SwiftButtonStyleDeclaration[]>();
  for (const declaration of declarations) {
    const matches = declarationsByName.get(declaration.name) ?? [];
    matches.push(declaration);
    declarationsByName.set(declaration.name, matches);
  }
  const sourceByPath = new Map(
    swiftSources.map(source => [
      source.path,
      { ...source, code: maskSwiftNonCode(source.source) },
    ])
  );
  const testSourceByPath = new Map<string, string>();
  const registeredTypes = new Set<string>();
  const registeredRoles = new Map<string, string>();

  for (const { entry, binding } of bindings) {
    if (registeredTypes.has(binding.swiftType)) {
      bad(issues, 'duplicate-native-family-owner', binding.swiftType);
    }
    registeredTypes.add(binding.swiftType);
    const roleOwner = registeredRoles.get(binding.semanticRole);
    if (roleOwner && roleOwner !== binding.swiftType) {
      bad(
        issues,
        'duplicate-native-family-owner',
        `${binding.semanticRole}:${roleOwner}:${binding.swiftType}`
      );
    }
    registeredRoles.set(binding.semanticRole, binding.swiftType);
    const owners = declarationsByName.get(binding.swiftType) ?? [];
    if (
      owners.length !== 1 ||
      owners.some(owner => owner.path !== binding.sourcePath)
    ) {
      bad(issues, 'missing-native-owner', `${entry.id}:${binding.swiftType}`);
    }
    if (
      owners.length === 1 &&
      owners[0].path === binding.sourcePath &&
      !ownsRegisteredNativeRecipe(owners[0], binding)
    ) {
      bad(
        issues,
        'invalid-native-owner-recipe',
        `${entry.id}:${binding.swiftType}`
      );
    }
    if (!binding.testEvidence.length) {
      bad(issues, 'missing-native-test', `${entry.id}:${binding.swiftType}`);
    }
    for (const testPath of binding.testEvidence) {
      if (
        !testPath.startsWith('apps/ios/JovieTests/') ||
        !testPath.endsWith('.swift') ||
        !repoRoot ||
        !existsSync(resolve(repoRoot, testPath)) ||
        !testIsInNativeTarget(repoRoot, testPath)
      ) {
        bad(issues, 'missing-native-test', `${entry.id}:${binding.swiftType}`);
        continue;
      }
      let testSource = testSourceByPath.get(testPath);
      if (!testSource) {
        testSource = maskSwiftNonCode(
          readFileSync(resolve(repoRoot, testPath), 'utf8')
        );
        testSourceByPath.set(testPath, testSource);
      }
      const assertionPatterns = nativeTestAssertionPatterns(binding);
      if (
        !assertionPatterns.every(pattern =>
          new RegExp(`#expect\\s*\\(\\s*${pattern.source}\\s*\\)`).test(
            testSource
          )
        )
      ) {
        bad(issues, 'missing-native-test', `${entry.id}:${binding.swiftType}`);
      }
    }
    const referencePattern = bindingReferencePattern(binding);
    const registeredConsumers = new Set(binding.consumerPaths);
    for (const swiftSource of sourceByPath.values()) {
      if (
        swiftSource.path !== binding.sourcePath &&
        referencePattern.test(swiftSource.code) &&
        !registeredConsumers.has(swiftSource.path)
      ) {
        bad(
          issues,
          'detached-native-consumer',
          `${binding.swiftType}:${swiftSource.path}`
        );
      }
    }
    for (const consumerPath of binding.consumerPaths) {
      const consumer = sourceByPath.get(consumerPath);
      if (!consumer || !referencePattern.test(consumer.code)) {
        bad(
          issues,
          'missing-native-consumer',
          `${binding.swiftType}:${consumerPath}`
        );
      }
    }
  }

  for (const declaration of declarations) {
    if (registeredTypes.has(declaration.name)) continue;
    if (ownsCanonicalPressRecipe(declaration.body)) {
      bad(
        issues,
        'duplicate-native-family-owner',
        `${declaration.name}:${declaration.path}`
      );
    } else if (!declaration.isFilePrivate) {
      bad(
        issues,
        'unregistered-reusable-native-style',
        `${declaration.name}:${declaration.path}`
      );
    }
  }
}

function validateAuthority(
  entry: UIOwnershipRegistryEntry,
  issues: UIOwnershipRegistryIssue[]
) {
  const { sourceAuthority: authority, canonicalOwner: owner } = entry;
  if (authority.registry === 'direct')
    return (
      owner.registryId === null ||
      badEntry(issues, entry, 'unresolved-source-authority')
    );
  const source =
    authority.registry === 'design-system'
      ? DESIGN_SYSTEM_COMPONENT_REGISTRY.find(item => item.id === authority.id)
      : authority.registry === 'marketing'
        ? MARKETING_SHELL_REGISTRY.find(item => item.id === authority.id)
        : APP_SCREEN_COMPONENT_REGISTRY.find(item => item.id === authority.id);
  if (!source) return badEntry(issues, entry, 'unresolved-source-authority');
  const expectedPath =
    authority.registry === 'design-system'
      ? source.source
      : authority.registry === 'marketing'
        ? source.resolvedSource
        : source.source;
  const expectedExport =
    authority.registry === 'design-system'
      ? source.exportName
      : authority.registry === 'marketing'
        ? source.exportName
        : appExports[source.id];
  if (
    !expectedPath ||
    !expectedExport ||
    owner.sourcePath !== expectedPath ||
    owner.exportName !== expectedExport ||
    owner.registryId !== source.id
  ) {
    badEntry(issues, entry, 'unresolved-source-authority');
  }
}

function validatePen(
  entry: UIOwnershipRegistryEntry,
  issues: UIOwnershipRegistryIssue[]
) {
  const p = entry.pen;
  const conflict =
    p.status === 'canonical'
      ? !p.sourceBacked ||
        !has(p.identity) ||
        !p.evidencePaths.length ||
        p.identity.startsWith('proposal:')
      : p.status === 'proposal'
        ? p.sourceBacked || p.identity !== null || !has(p.reason)
        : p.status === 'unresolved'
          ? p.identity !== null || !has(p.reason)
          : p.sourceBacked ||
            p.identity !== null ||
            Boolean(p.evidencePaths.length) ||
            !has(p.reason);
  if (conflict) badEntry(issues, entry, 'pen-status-conflict');
}

function validateAdapters(
  entry: UIOwnershipRegistryEntry,
  issues: UIOwnershipRegistryIssue[]
) {
  const seen = new Set<string>();
  for (const adapter of entry.platformAdapters) {
    if (
      !UI_OWNERSHIP_PLATFORMS.includes(adapter.platform) ||
      seen.has(adapter.platform)
    )
      badEntry(issues, entry, 'invalid-platform-adapter');
    seen.add(adapter.platform);
    if (
      (adapter.status === 'implemented' || adapter.status === 'planned') &&
      !adapter.sourcePaths.length
    )
      badEntry(issues, entry, 'missing-platform-adapter');
    if (adapter.status === 'not-applicable' && !has(adapter.reason))
      badEntry(issues, entry, 'invalid-platform-adapter');
    if (adapter.sourcePaths.some(sourcePath => sourcePath.includes('.pen')))
      badEntry(issues, entry, 'invalid-platform-adapter');
    for (const binding of adapter.nativeBindings ?? []) {
      if (
        adapter.platform !== 'ios' ||
        adapter.status !== 'implemented' ||
        !has(binding.sourcePath) ||
        !has(binding.swiftType) ||
        !has(binding.semanticRole) ||
        !adapter.sourcePaths.includes(binding.sourcePath) ||
        binding.consumerPaths.some(path => !adapter.sourcePaths.includes(path))
      ) {
        badEntry(issues, entry, 'invalid-native-binding');
      }
    }
  }
  for (const platform of UI_OWNERSHIP_PLATFORMS)
    if (!seen.has(platform))
      badEntry(issues, entry, 'missing-platform-adapter');
}

function validateStates(
  entry: UIOwnershipRegistryEntry,
  issues: UIOwnershipRegistryIssue[]
) {
  const registered = new Set(entry.states);
  for (const state of entry.states)
    if (!UI_OWNERSHIP_STATES.includes(state))
      badEntry(issues, entry, 'invalid-state');
  for (const state of entry.requiredStates)
    if (!registered.has(state))
      badEntry(issues, entry, 'missing-required-state');
  const registeredBreakpoints = new Set(entry.breakpoints);
  for (const breakpoint of entry.breakpoints)
    if (!UI_OWNERSHIP_BREAKPOINTS.includes(breakpoint))
      badEntry(issues, entry, 'missing-breakpoint');
  for (const breakpoint of UI_OWNERSHIP_BREAKPOINTS) {
    if (!registeredBreakpoints.has(breakpoint))
      badEntry(issues, entry, 'missing-breakpoint');
    if (!has(entry.adaptiveModes[breakpoint]))
      badEntry(issues, entry, 'invalid-adaptive-mode');
  }
}

export function validateUIOwnershipRegistry({
  entries = UI_OWNERSHIP_REGISTRY,
  swiftSources = loadProductionSwiftSources(),
  repoRoot = findRepoRoot(process.cwd()),
}: {
  entries?: readonly UIOwnershipRegistryEntry[];
  swiftSources?: readonly UINativeSwiftSource[];
  repoRoot?: string | null;
} = {}): readonly UIOwnershipRegistryIssue[] {
  const issues: UIOwnershipRegistryIssue[] = [];
  const ids = new Set<string>();
  const owners = new Set<string>();
  const sourcePaths = new Set<string>();
  const aliases = new Set<string>();
  const coveredSurfaces = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) badEntry(issues, entry, 'duplicate-entry-id');
    ids.add(entry.id);
    const owner = entry.canonicalOwner;
    const ownerKey = `${owner.sourcePath}::${owner.exportName}`;
    if (!has(owner.sourcePath) || !has(owner.exportName))
      badEntry(issues, entry, 'missing-owner');
    else if (owners.has(ownerKey)) badEntry(issues, entry, 'duplicate-owner');
    owners.add(ownerKey);
    if (!entry.sourcePaths.includes(owner.sourcePath))
      badEntry(issues, entry, 'missing-source-path');
    for (const sourcePath of entry.sourcePaths) {
      if (!has(sourcePath) || sourcePath.includes('.pen'))
        badEntry(issues, entry, 'missing-source-path');
      if (sourcePaths.has(sourcePath))
        badEntry(issues, entry, 'duplicate-source-path');
      sourcePaths.add(sourcePath);
    }
    for (const surface of entry.surfaces) {
      if (!UI_OWNERSHIP_SURFACES.includes(surface))
        badEntry(issues, entry, 'missing-surface');
      coveredSurfaces.add(surface);
    }
    for (const alias of entry.duplicateAliases) {
      if (aliases.has(alias)) badEntry(issues, entry, 'duplicate-alias');
      aliases.add(alias);
    }
    validateAuthority(entry, issues);
    validateAdapters(entry, issues);
    validateStates(entry, issues);
    validatePen(entry, issues);
    if (
      !['inter', 'satoshi-display', 'platform-native-sans'].includes(
        entry.typography.family
      ) ||
      hasDisallowedTypefaceToken(entry.typography.family)
    )
      badEntry(issues, entry, 'unregistered-serif');
    const exception = entry.typography.serifException;
    if (
      exception &&
      (!has(exception.sourcePath) ||
        exception.sourcePath.includes('.pen') ||
        !has(exception.owner) ||
        !has(exception.reason))
    )
      badEntry(issues, entry, 'unregistered-serif');
    const geometry = entry.visibleControlGeometry;
    if (geometry && (geometry.visiblePx !== 32 || geometry.hitTargetPx !== 44))
      badEntry(issues, entry, 'invalid-visible-control-geometry');
    const elevation = entry.surfaceElevation;
    if (
      entry.id === 'organism.app-shell-frame' &&
      (!elevation ||
        elevation.page !== 'canvas' ||
        elevation.sidebar !== 'canvas' ||
        elevation.main !== 'panel')
    )
      badEntry(issues, entry, 'invalid-surface-elevation');
  }
  for (const id of UI_OWNERSHIP_ENTRY_IDS)
    if (!ids.has(id)) bad(issues, 'missing-owner', id);
  for (const surface of UI_OWNERSHIP_SURFACES)
    if (!coveredSurfaces.has(surface)) bad(issues, 'missing-surface', surface);
  for (const entry of entries)
    for (const alias of entry.duplicateAliases)
      if (ids.has(alias))
        badEntry(issues, entry, 'alias-collides-with-entry-id');
  validateNativeButtonOwnership(entries, swiftSources, issues, repoRoot);
  return issues;
}
