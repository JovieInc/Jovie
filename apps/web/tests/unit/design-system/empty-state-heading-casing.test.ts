import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Empty-state heading casing guard (docs/design-system/pen-briefs/empty-states.md).
 *
 * Every page that has no data uses one anatomy: a Title Case heading, one
 * sentence, one action. The label-casing lint does not read the `heading`
 * prop, so mixed "No work yet" / "No Contacts Yet" headings shipped side by
 * side. This scans every literal `heading` on EmptyState and TableEmptyState.
 *
 * Exempt by design: `presentation='quiet'` (one calm sentence) and
 * `variant='error'` (recovery copy owned by the RecoveryState contract), and
 * any element with a `ui-casing-allow:` comment, as for the casing lint.
 *
 * KNOWN holds existing headings outside the creator pages (operator admin
 * surfaces, and components queued for deletion). It may only shrink: fix one
 * and delete its line. A new non-Title-Case heading fails here.
 */

const requireCjs = createRequire(import.meta.url);
const { isTitleCase, toCanonicalTitleCase } = requireCjs(
  '../../../eslint-rules/canonical-ui-label-casing-utils.js'
) as {
  isTitleCase: (value: string) => boolean;
  toCanonicalTitleCase: (value: string) => string;
};

const WEB_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
);
const SCAN_ROOTS = ['app', 'components'];
const EMPTY_STATE_TAGS = new Set(['EmptyState', 'TableEmptyState']);
const SKIP_FILE = /\.(test|spec|stories)\.tsx$/;

const KNOWN = new Set([
  'components/features/admin/FounderReviewRegistry.tsx#No registry items found',
  'components/features/admin/admin-releases-table/AdminReleasesTableUnified.tsx#No releases found on the platform',
  'components/features/admin/system-map/AdminSystemMap.tsx#No tools registered.',
  'components/features/admin/agent-os/AgentOsRunsPanel.tsx#No AgentOS runs',
  'components/features/admin/outbound/OutboundWorkspace.tsx#Outbound queue unavailable',
  'components/features/admin/certifications/OvieCertificationsWorkspace.tsx#No certification items yet',
  'components/features/admin/certifications/OvieCertificationsWorkspace.tsx#Certifications unavailable',
  'components/features/admin/certifications/OvieCertificationsWorkspace.tsx#No items match these filters',
  'components/features/admin/admin-assets-table/AdminAssetsTable.tsx#No assets match these filters',
  'components/features/admin/leads/LeadTable.tsx#Admin verification required',
  'components/features/admin/leads/LeadTable.tsx#Unable to load leads',
  'components/features/admin/leads/LeadTable.tsx#No leads found',
  'components/features/admin/lists/OvieSmartViewWorkspace.tsx#View unavailable',
  'components/features/admin/lists/OvieListsIndex.tsx#Lists unavailable',
  'components/features/admin/lists/OvieListsIndex.tsx#No lists yet',
  'components/features/admin/lists/OvieListWorkspace.tsx#List unavailable',
  'components/features/admin/lists/OvieListWorkspace.tsx#Nothing to triage',
  'components/features/admin/campaigns/InviteCampaignManager.tsx#No invite activity',
  'app/app/(shell)/admin/investors/updates/page.tsx#Could not load investor updates.',
  'app/app/(shell)/admin/costs/CostsTable.tsx#No cost items',
  'app/app/(shell)/admin/features/AdminFeaturesTable.tsx#No feature flags',
  'app/app/(shell)/admin/revenue-lift/page.tsx#Could not load revenue-lift metrics.',
  // Creator pages whose copy moves with a story or lint cleanup in a later slice.
  'components/features/dashboard/organisms/SettingsContactsSection.tsx#No contacts yet',
  'components/features/dashboard/organisms/grouped-links/GroupedLinksManager.tsx#Add your first link',
  'components/features/dashboard/youtube/YouTubeChannelPilotPanel.tsx#Authorized Channel Is Waiting for Its First Sync',
  // Queued for deletion as dead code (#24513).
  "components/features/dashboard/organisms/jovie-work-feed/JovieWorkPanel.tsx#Select a profile to see Jovie's autonomous work.",
  'components/features/dashboard/organisms/DashboardAnalyticsCards.tsx#No profile views yet',
  'components/features/dashboard/organisms/settings-artist-profile-section/ConnectedDspList.tsx#No streaming profiles connected',
  'components/features/dashboard/organisms/settings-artist-profile-section/ConnectedDspList.tsx#Unable to load streaming profiles',
  'components/features/dashboard/youtube/RevivalQueuePanel.tsx#No underperforming videos found.',
]);

function listTsx(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listTsx(path);
    return entry.name.endsWith('.tsx') && !SKIP_FILE.test(entry.name)
      ? [path]
      : [];
  });
}

function literal(
  init: ts.JsxAttributeValue | undefined
): string | null | undefined {
  if (!init) return undefined;
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression) {
    const e = init.expression;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e))
      return e.text;
  }
  return null;
}

export function findEmptyStateHeadings(path: string, source: string) {
  const file = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const found: Array<{ heading: string; exempt: boolean }> = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      EMPTY_STATE_TAGS.has(node.tagName.getText(file))
    ) {
      const attrs = new Map<string, string | null | undefined>();
      for (const prop of node.attributes.properties) {
        if (ts.isJsxAttribute(prop))
          attrs.set(prop.name.getText(file), literal(prop.initializer));
      }
      const heading = attrs.get('heading');
      if (typeof heading === 'string') {
        const before = source.slice(
          Math.max(0, node.getStart(file) - 240),
          node.getStart(file)
        );
        found.push({
          heading,
          exempt:
            attrs.get('presentation') === 'quiet' ||
            attrs.get('variant') === 'error' ||
            /ui-casing-allow:[^\n]*\n?[^\n]*$/.test(before),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe('empty-state heading casing', () => {
  it('flags sentence-case headings and honours the exemptions', () => {
    const found = findEmptyStateHeadings(
      'x.tsx',
      [
        "<EmptyState heading='No work yet' />;",
        "<TableEmptyState heading='No Links Yet' />;",
        "<EmptyState presentation='quiet' heading='Nothing needs you.' />;",
        "<EmptyState variant='error' heading='Chat could not load.' />;",
        '<EmptyState heading={title} />;',
      ].join('\n')
    );
    expect(found).toEqual([
      { heading: 'No work yet', exempt: false },
      { heading: 'No Links Yet', exempt: false },
      { heading: 'Nothing needs you.', exempt: true },
      { heading: 'Chat could not load.', exempt: true },
    ]);
    expect(isTitleCase('No work yet')).toBe(false);
  });

  it('keeps every literal EmptyState heading in Title Case', () => {
    const offenders: string[] = [];
    for (const root of SCAN_ROOTS) {
      for (const path of listTsx(join(WEB_ROOT, root))) {
        const rel = relative(WEB_ROOT, path);
        const source = readFileSync(path, 'utf8');
        if (!/<(Table)?EmptyState\b/.test(source)) continue;
        for (const { heading, exempt } of findEmptyStateHeadings(rel, source)) {
          if (exempt || isTitleCase(heading) || KNOWN.has(`${rel}#${heading}`))
            continue;
          offenders.push(
            `${rel}: "${heading}" -> "${toCanonicalTitleCase(heading)}"`
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
