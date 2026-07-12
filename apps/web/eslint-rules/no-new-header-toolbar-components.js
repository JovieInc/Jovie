/**
 * ESLint rule: no-new-header-toolbar-components
 *
 * The header/toolbar "component zoo" has grown to ~28 distinct `*Header.tsx`
 * and `*Toolbar.tsx` files under `apps/web/components/**` with no shared
 * contract. Before the One App Shell refactor consolidates these into a
 * canonical set, this rule freezes the count: any NEW file matching
 * `(Header|Toolbar).tsx` under `apps/web/components/**` that isn't already on
 * the allowlist below gets a warning pointing back at the existing systems.
 *
 * This is a warn-level guardrail, not a build-breaker — the point is to make
 * new additions to the zoo a visible, reviewable choice instead of a silent
 * default. Existing files are allowlisted so authoring/re-exporting them
 * never triggers the rule.
 *
 * @see .context/one-shell/manifests/0-1-nav-guardrails.md
 * @see GitHub #12633 (One App Shell) / #12645
 */

// Snapshot of every *Header.tsx / *Toolbar.tsx under apps/web/components as of
// the One App Shell guardrail chunk (JOV one-shell 0.1). Paths are relative to
// `apps/web/`. Add to this list only alongside an explicit decision to grow
// the header/toolbar surface — the refactor swarm should be shrinking it.
const ALLOWLISTED_COMPONENT_PATHS = [
  'components/features/admin/table/AdminCreatorsTableHeader.tsx',
  'components/features/admin/table/AdminTableHeader.tsx',
  'components/features/dashboard/atoms/AudienceMemberHeader.tsx',
  'components/features/dashboard/audience/table/molecules/AudienceTableHeader.tsx',
  'components/features/dashboard/molecules/SectionHeader.tsx',
  'components/features/dashboard/organisms/DashboardHeader.tsx',
  'components/features/dashboard/organisms/contacts-table/ContactDetailHeader.tsx',
  'components/features/dashboard/organisms/profile-contact-sidebar/ProfileContactHeader.tsx',
  'components/features/dashboard/organisms/profile-contact-sidebar/ProfileSidebarHeader.tsx',
  'components/features/dashboard/organisms/table/TableToolbar.tsx',
  'components/features/dev/DevToolbar.tsx',
  'components/features/library-share/LibraryShareDropHeader.tsx',
  'components/features/profile/ProfileHeader.tsx',
  'components/jovie/components/ChatComposerToolbar.tsx',
  'components/jovie/components/ChatPinnedOpportunityHeader.tsx',
  'components/marketing/artist-profile/ArtistProfileSectionHeader.tsx',
  'components/molecules/ContentSectionHeader.tsx',
  'components/molecules/DocToolbar.tsx',
  'components/molecules/drawer/DrawerHeader.tsx',
  'components/organisms/billing/BillingHeader.tsx',
  'components/organisms/profile-sidebar/ProfileSidebarHeader.tsx',
  'components/organisms/public-surface/PublicSurfaceHeader.tsx',
  'components/organisms/release-sidebar/ReleaseSidebarHeader.tsx',
  'components/organisms/table/atoms/GroupHeader.tsx',
  'components/organisms/table/molecules/PageToolbar.tsx',
  'components/organisms/table/molecules/TableBulkActionsToolbar.tsx',
  'components/organisms/table/molecules/TableStandardToolbar.tsx',
  'components/organisms/table/organisms/UnifiedTableHeader.tsx',
  'components/shell/LyricsHeader.tsx',
  'components/site/Header.tsx',
  'components/site/MarketingHeader.tsx',
];

const HEADER_TOOLBAR_FILENAME_PATTERN = /(Header|Toolbar)\.tsx$/;
const COMPONENTS_DIR_PATTERN = /\/components\//;

function normalize(filePath) {
  return filePath.replaceAll('\\', '/');
}

/**
 * Returns the path relative to `apps/web/` when the file lives under
 * `apps/web/components/`, or null when it doesn't (e.g. a different app,
 * or a path outside the components tree).
 */
function toWebRelativePath(filename) {
  const normalized = normalize(filename);
  const marker = '/apps/web/';
  const index = normalized.lastIndexOf(marker);
  if (index === -1) return null;
  return normalized.slice(index + marker.length);
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Warn when a new *Header.tsx/*Toolbar.tsx component is added under apps/web/components without being added to the allowlist — freezes the header/toolbar component zoo ahead of the One App Shell refactor',
      recommended: false,
    },
    messages: {
      notAllowlisted:
        'New header/toolbar component "{{relativePath}}" is not on the allowlist in ' +
        'eslint-rules/no-new-header-toolbar-components.js. There are already ~28 ' +
        '*Header.tsx/*Toolbar.tsx components under apps/web/components — check whether ' +
        'an existing one (DashboardHeader, PageToolbar, UnifiedTableHeader, etc.) can be ' +
        'reused or extended before adding another. If this is an intentional new system, ' +
        'add it to the allowlist array. See .context/one-shell/manifests/0-1-nav-guardrails.md.',
    },
    schema: [],
  },

  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? '';
    const normalized = normalize(filename);

    if (
      !HEADER_TOOLBAR_FILENAME_PATTERN.test(normalized) ||
      !COMPONENTS_DIR_PATTERN.test(normalized)
    ) {
      return {};
    }

    const relativePath = toWebRelativePath(normalized);
    if (relativePath === null) return {};

    if (ALLOWLISTED_COMPONENT_PATHS.includes(relativePath)) {
      return {};
    }

    return {
      Program(node) {
        context.report({
          node,
          messageId: 'notAllowlisted',
          data: { relativePath },
        });
      },
    };
  },
};
