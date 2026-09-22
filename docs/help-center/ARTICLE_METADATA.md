# Help Center article metadata contract

Status: canonical build contract
Owner: JOV-5899
Implementation: `apps/docs/lib/article-metadata.mjs`

Every `apps/docs/app/**/page.mdx` file is loaded into one registry during the
docs build. Navigation, Pagefind search eligibility, sitemap generation, and
related-guide lookup use the same registry and publication policy.

## Frontmatter

```yaml
id: connect-spotify
title: Connect Spotify to Jovie
description: Add your Spotify artist account and import your catalog.
documentType: guide
category: jovie-essentials
productBacked: true
featureId: auto-sync-from-spotify
additionalFeatureIds: []
productRoute: /app/library
status: certified
lastVerifiedAt: 2026-09-03
verifiedBy: human
keywords:
  - connect spotify
  - missing spotify music
  - import catalog
redirectAliases:
  - /docs/self-serve-guide/connect-dsps
visualProofRefs:
  - proof/connect-spotify-success.png
uiLabels:
  - Library
  - Releases
  - Connect Spotify
productSourceRefs:
  - apps/web/components/features/dashboard/organisms/release-provider-matrix
launchPath: true
```

## Required fields and conditionals

| Field | Contract |
|---|---|
| `id` | Unique, stable, lowercase kebab-case article ID. |
| `title` / `description` | Non-empty title and a concise 20–200 character description. |
| `documentType` | `guide`, `reference`, `landing`, or migration-only `legacy`. |
| `category` | `jovie-essentials`, `build-your-presence`, `manage-jovie`, `developers`, or migration-only `legacy`. |
| `productBacked` | Explicit boolean. Product-backed guides require a real `featureId`, `productRoute`, and `productSourceRefs`. |
| `featureId` | Stable ID explicitly listed in the `Stable Feature IDs` section of `docs/FEATURE_REGISTRY.md`. `additionalFeatureIds` records secondary capabilities. |
| `productRoute` | Must resolve to a literal value in `apps/web/constants/routes.ts`. Use `null` plus `routeUnavailableReason` only when no product route exists. |
| `status` | `draft`, `uncertified`, `certified`, `stale`, `retired`, or non-guide `published`. |
| `lastVerifiedAt` / `verifiedBy` | Use a real `YYYY-MM-DD` plus `human` or `machine` only for completed verification; otherwise use `null` and `unverified`. |
| `keywords` | Search aliases; at least one is required. |
| `redirectAliases` | Explicit array, empty when no aliases apply. |
| `visualProofRefs` | Required for every certified guide. |
| `uiLabels` / `productSourceRefs` | Labels the guide instructs customers to use and source paths that own those labels or behavior. |
| `launchPath` | V1 launch-path guides set this to `true`; certification then requires `verifiedBy: human`. |

The frontmatter parser deliberately supports this flat contract only. Nested or
multiline YAML fails with a source path and line number rather than being
silently reinterpreted.

## Publication policy

- A guide enters primary navigation, Pagefind search, the sitemap, and related
  guides only when `status: certified`.
- A `reference` or `landing` document may use `status: published` without
  claiming that a customer feature is available.
- `draft`, `uncertified`, `stale`, `retired`, and every `legacy` document are
  excluded from all four primary consumers. Their MDX must also set
  `searchable: false`; the build fails if Pagefind disagrees with the registry.
- Existing title-only product pages were migrated as `legacy` + `retired`.
  Their content was not certified by the migration.
- A missing feature ID fails the build. A missing route fails the build instead
  of allowing a stale instruction to remain discoverable.

## Event-driven recertification

`scripts/help-center-recertification.mjs` compares the exact before/after Git
revisions for a main-branch product change. It detects:

- feature-registry state changes for declared feature IDs;
- route-registry value changes for declared product routes;
- UI-label declarations or declared product-source changes; and
- article certification-state or proof changes.

The `Help Center Recertification` workflow runs only on relevant main-branch
pushes. It opens or updates one fingerprinted Linear documentation-review issue
per affected certified article. It has no schedule and performs no time-based
sweep.

## Decision

**Ship now:** strict metadata validation, an explicit zero-certified migration,
shared primary-publication policy, and event-driven affected-article review.

**Re-evaluate when:** a V1 guide is ready on an exact candidate build or the
feature/route registries become structured data rather than source-derived
registries.

**Then:** human-certify the launch-path guide with visual proof, or keep it
quarantined as `uncertified`, `stale`, or `retired`.
