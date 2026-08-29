#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const RUNTIME_ROOTS = ['apps/web/app', 'apps/web/lib'];
const LEGACY_FIELD_NAME = 'clerkId';
const LEGACY_HELPER_NAME = 'fetchUserBillingData';
const PREDICATE_CALLS = new Set([
  'eq',
  'gt',
  'gte',
  'ilike',
  'inArray',
  'like',
  'lt',
  'lte',
  'ne',
  'notInArray',
]);

// Production consumer binding: JOV-INV-018.

// These are boundary adapters whose input is explicitly a legacy Clerk ID.
// They may not grow without updating this reviewed contract.
export const APPROVED_LEGACY_ADAPTERS = Object.freeze({
  'apps/web/lib/auth/native-test-clerk-user.server.ts': 1,
  'apps/web/lib/db/queries/shared.ts': 1,
  'apps/web/lib/stripe/customer-sync/queries.ts': 2,
  'apps/web/lib/testing/test-user-provision.server.ts': 2,
});

// Only explicit legacy-ID adapters may call the legacy billing helper. The
// authenticated customer path must use fetchUserBillingDataByAppId instead.
export const APPROVED_LEGACY_HELPER_CALLERS = Object.freeze({
  'apps/web/lib/stripe/customer-sync/billing-info.ts': 1,
  'apps/web/lib/stripe/customer-sync/queries.ts': 1,
});

// Ratchet only: these pre-cutover predicates may shrink but may never grow.
// A changed file is held to zero even when it appears in this baseline.
export const LEGACY_DEBT_BASELINE = Object.freeze({
  'apps/web/app/[username]/claim/route.ts': 1,
  'apps/web/app/api/account/export/route.ts': 1,
  'apps/web/app/api/admin/set-plan/route.ts': 1,
  'apps/web/app/api/chat/feedback/route.ts': 1,
  'apps/web/app/api/connectors/google/authorize/route.ts': 1,
  'apps/web/app/api/connectors/google/disconnect/route.ts': 1,
  'apps/web/app/api/dashboard/earnings/route.ts': 1,
  'apps/web/app/api/dashboard/releases/[releaseId]/analytics/route.ts': 1,
  'apps/web/app/api/dashboard/retargeting/ad-creative/route.tsx': 1,
  'apps/web/app/api/dashboard/shop/route.ts': 1,
  'apps/web/app/api/dev/connectors/extract-now/route.ts': 1,
  'apps/web/app/api/dev/connectors/seed-fixtures/route.ts': 1,
  'apps/web/app/api/dsp/catalog-scan/mismatches/[id]/route.ts': 1,
  'apps/web/app/api/dsp/catalog-scan/results/route.ts': 1,
  'apps/web/app/api/dsp/catalog-scan/route.ts': 1,
  'apps/web/app/api/dsp/catalog-scan/status/route.ts': 1,
  'apps/web/app/api/feedback/route.ts': 1,
  'apps/web/app/api/growth-access-request/route.ts': 2,
  'apps/web/app/api/max-access-request/route.ts': 2,
  'apps/web/app/api/memory/graph/route.ts': 1,
  'apps/web/app/api/pre-save/apple/route.ts': 1,
  'apps/web/app/api/pre-save/spotify/callback/route.ts': 1,
  'apps/web/app/api/sms-access-request/route.ts': 1,
  'apps/web/app/api/user-interviews/route.ts': 1,
  'apps/web/app/api/verification/request/route.ts': 1,
  'apps/web/app/app/(shell)/admin/platform-connections/actions.ts': 1,
  'apps/web/app/app/(shell)/dashboard/actions/social-links.ts': 1,
  'apps/web/app/onboarding/actions/connect-spotify.ts': 1,
  'apps/web/app/onboarding/actions/enrich-profile.ts': 1,
  'apps/web/app/onboarding/actions/profile-setup.ts': 1,
  'apps/web/app/onboarding/actions/update-profile.ts': 3,
  'apps/web/lib/admin/impersonation.ts': 2,
  'apps/web/lib/admin/platform-connections.ts': 1,
  'apps/web/lib/analytics/self-exclusion.ts': 1,
  'apps/web/lib/auth/dev-test-auth.server.ts': 1,
  'apps/web/lib/chat/submit-feedback.ts': 1,
  'apps/web/lib/leads/funnel-events.ts': 2,
  'apps/web/lib/notifications/preferences.ts': 1,
  'apps/web/lib/pixels/queries.server.ts': 1,
  'apps/web/lib/referrals/service.ts': 1,
  'apps/web/lib/services/profile/mutations.ts': 1,
  'apps/web/lib/services/retouching/jobs.ts': 1,
  'apps/web/lib/services/social-links/queries.ts': 1,
  'apps/web/lib/stripe/dunning.ts': 1,
  'apps/web/lib/stripe/webhooks/handlers/subscription-handler.ts': 1,
  'apps/web/lib/submission-agent/service.ts': 1,
  'apps/web/lib/tracking/with-pixel-session.ts': 1,
  'apps/web/lib/username/availability.ts': 1,
  'apps/web/lib/waitlist/redeem.ts': 2,
  'apps/web/lib/waitlist/signup.ts': 1,
});

function toRepoPath(path) {
  return relative(REPO_ROOT, path).split(sep).join('/');
}

function isRuntimeTypeScript(path) {
  return (
    (path.endsWith('.ts') || path.endsWith('.tsx')) &&
    !path.endsWith('.test.ts') &&
    !path.endsWith('.test.tsx') &&
    !path.includes('/tests/')
  );
}

function walk(directory, files = []) {
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory)) {
    const absolute = resolve(directory, entry);
    if (statSync(absolute).isDirectory()) {
      walk(absolute, files);
    } else {
      const path = toRepoPath(absolute);
      if (isRuntimeTypeScript(path)) files.push(path);
    }
  }
  return files;
}

function parseTypeScript(source, path = 'source.ts') {
  return ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
}

function expressionName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return undefined;
}

function collectUsersTableAliases(sourceFile) {
  const aliases = new Set(['users']);

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if ((element.propertyName?.text || element.name.text) === 'users') {
        aliases.add(element.name.text);
      }
    }
  }

  let grew = true;
  while (grew) {
    grew = false;
    const visit = node => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer
      ) {
        const initializer = node.initializer;
        const directAlias =
          ts.isIdentifier(initializer) && aliases.has(initializer.text);
        const callAlias =
          ts.isCallExpression(initializer) &&
          initializer.arguments.some(
            argument => ts.isIdentifier(argument) && aliases.has(argument.text)
          );
        if ((directAlias || callAlias) && !aliases.has(node.name.text)) {
          aliases.add(node.name.text);
          grew = true;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return aliases;
}

function isLegacyFieldAccess(node, usersTableAliases) {
  if (ts.isPropertyAccessExpression(node)) {
    return (
      node.name.text === LEGACY_FIELD_NAME &&
      ts.isIdentifier(node.expression) &&
      usersTableAliases.has(node.expression.text)
    );
  }
  return (
    ts.isElementAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    usersTableAliases.has(node.expression.text) &&
    ts.isStringLiteralLike(node.argumentExpression) &&
    node.argumentExpression.text === LEGACY_FIELD_NAME
  );
}

function isRawSqlPresenceCheck(node, taggedTemplate) {
  if (!ts.isTemplateExpression(taggedTemplate.template)) return false;
  const span = taggedTemplate.template.templateSpans.find(
    item => item.expression === node
  );
  return Boolean(span && /^\s+IS\s+(?:NOT\s+)?NULL\b/i.test(span.literal.text));
}

function isInsideLegacyPredicate(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (
      ts.isCallExpression(current) &&
      PREDICATE_CALLS.has(expressionName(current.expression))
    ) {
      return true;
    }
    if (
      ts.isTaggedTemplateExpression(current) &&
      /sql$/i.test(expressionName(current.tag) || '')
    ) {
      return !isRawSqlPresenceCheck(node, current);
    }
    if (ts.isStatement(current)) return false;
  }
  return false;
}

export function findDirectLegacyPredicates(source, path = 'source.ts') {
  const sourceFile = parseTypeScript(source, path);
  const usersTableAliases = collectUsersTableAliases(sourceFile);
  const findings = [];
  const visit = node => {
    if (
      isLegacyFieldAccess(node, usersTableAliases) &&
      isInsideLegacyPredicate(node)
    ) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart()
      );
      findings.push({ line: line + 1, count: 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

export function findLegacyHelperCalls(source, path = 'source.ts') {
  const sourceFile = parseTypeScript(source, path);
  const localNames = new Set(
    path === 'apps/web/lib/stripe/customer-sync/queries.ts'
      ? [LEGACY_HELPER_NAME]
      : []
  );
  const namespaceNames = new Set();
  const findings = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const moduleName = ts.isStringLiteral(statement.moduleSpecifier)
      ? statement.moduleSpecifier.text
      : '';
    const isBillingQueryModule = new Set([
      './queries',
      '@/lib/stripe/customer-sync',
      '@/lib/stripe/customer-sync/index',
      '@/lib/stripe/customer-sync/queries',
    ]).has(moduleName);
    if (!isBillingQueryModule) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings) continue;
    if (ts.isNamespaceImport(bindings)) {
      namespaceNames.add(bindings.name.text);
      continue;
    }
    if (!ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if (
        (element.propertyName?.text || element.name.text) === LEGACY_HELPER_NAME
      ) {
        localNames.add(element.name.text);
      }
    }
  }

  const visit = node => {
    if (ts.isCallExpression(node)) {
      const calledDirectly =
        ts.isIdentifier(node.expression) &&
        localNames.has(node.expression.text);
      const calledFromNamespace =
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === LEGACY_HELPER_NAME &&
        ts.isIdentifier(node.expression.expression) &&
        namespaceNames.has(node.expression.expression.text);
      if (calledDirectly || calledFromNamespace) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart()
        );
        findings.push({ line: line + 1, count: 1 });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

export function auditSources({
  sources,
  changedPaths = [],
  approvedLegacyAdapters = APPROVED_LEGACY_ADAPTERS,
  approvedLegacyHelperCallers = APPROVED_LEGACY_HELPER_CALLERS,
  legacyDebtBaseline = LEGACY_DEBT_BASELINE,
}) {
  const changed = new Set(changedPaths);
  const helperCallInventory = [];
  const inventory = [];
  const violations = [];

  for (const [path, source] of Object.entries(sources)) {
    const findings = findDirectLegacyPredicates(source, path);
    const count = findings.reduce((sum, finding) => sum + finding.count, 0);
    if (count > 0) {
      const approvedLimit = approvedLegacyAdapters[path];
      const baselineLimit = legacyDebtBaseline[path];
      inventory.push({
        path,
        count,
        lines: findings.map(finding => finding.line),
      });

      if (approvedLimit !== undefined && count > approvedLimit) {
        violations.push({
          path,
          reason: `approved legacy adapter grew from ${approvedLimit} to ${count} direct predicates`,
        });
      } else if (approvedLimit === undefined && baselineLimit === undefined) {
        violations.push({
          path,
          reason: `${count} unapproved direct legacy predicate(s)`,
        });
      } else if (
        approvedLimit === undefined &&
        baselineLimit !== undefined &&
        count > baselineLimit
      ) {
        violations.push({
          path,
          reason: `legacy debt grew from ${baselineLimit} to ${count} direct predicates`,
        });
      } else if (approvedLimit === undefined && changed.has(path)) {
        violations.push({
          path,
          reason:
            'changed authenticated server code must replace users.clerkId ownership predicates with appUserIdFilter or an approved identity resolver',
        });
      }
    }

    const helperFindings = findLegacyHelperCalls(source, path);
    const helperCallCount = helperFindings.reduce(
      (sum, finding) => sum + finding.count,
      0
    );
    if (helperCallCount === 0) continue;

    helperCallInventory.push({
      path,
      count: helperCallCount,
      lines: helperFindings.map(finding => finding.line),
    });
    const helperLimit = approvedLegacyHelperCallers[path];
    if (helperLimit === undefined) {
      violations.push({
        path,
        reason: `${helperCallCount} call(s) to the legacy billing helper outside an approved legacy-ID adapter`,
      });
    } else if (helperCallCount > helperLimit) {
      violations.push({
        path,
        reason: `approved legacy billing helper caller grew from ${helperLimit} to ${helperCallCount} call(s)`,
      });
    }
  }

  return { helperCallInventory, inventory, violations };
}

function readChangedPaths(base) {
  const result = spawnSync(
    'git',
    ['diff', '--diff-filter=ACMR', '--name-only', `${base}...HEAD`],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
  if (result.status !== 0) {
    throw new Error(
      `Could not resolve changed-path identity scope from ${base}: ${result.stderr.trim()}`
    );
  }
  return result.stdout
    .split('\n')
    .map(value => value.trim())
    .filter(isRuntimeTypeScript);
}

function loadRuntimeSources() {
  const paths = RUNTIME_ROOTS.flatMap(root => walk(resolve(REPO_ROOT, root)));
  return Object.fromEntries(
    paths
      .map(path => [path, readFileSync(resolve(REPO_ROOT, path), 'utf8')])
      .filter(
        ([, source]) =>
          source.includes(LEGACY_FIELD_NAME) ||
          source.includes(LEGACY_HELPER_NAME)
      )
  );
}

export function runIdentityGuard({ changedOnly = false, base } = {}) {
  const sources = loadRuntimeSources();
  const changedPaths = changedOnly
    ? readChangedPaths(base || process.env.TURBO_SCM_BASE || 'origin/main')
    : [];
  const result = auditSources({ sources, changedPaths });
  const approvedCount = result.inventory.filter(
    item => APPROVED_LEGACY_ADAPTERS[item.path] !== undefined
  ).length;
  const debtCount = result.inventory.length - approvedCount;

  if (result.violations.length > 0) {
    for (const violation of result.violations) {
      console.error(
        `app-user-identity: ${violation.path}: ${violation.reason}`
      );
    }
    return 1;
  }

  console.log(
    `app-user-identity: pass (${result.inventory.length} legacy-query files inventoried; ${approvedCount} approved adapters; ${debtCount} ratcheted debt files; ${result.helperCallInventory.length} approved legacy-helper caller files; ${changedPaths.length} changed runtime files checked)`
  );
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = runIdentityGuard({
    changedOnly: process.argv.includes('--changed'),
  });
}
