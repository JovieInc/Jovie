# @jovie/extension-contracts

Type-only package shared between the Jovie web app (`apps/web`) and the browser extension. Defines the wire formats they both speak — request/response shapes, page-kind enums, workflow IDs, and field-mapping contracts.

There is no runtime code. Everything is a `type`, `interface`, or readonly const tuple.

## Why a separate package

The extension and the web app are separate deployments but they have to agree on the JSON they exchange (extension → web app summary endpoint, web app → extension fill-preview/apply/undo). Pinning those shapes here prevents one side from drifting and silently breaking the other.

## What's exported

### Page + entity classification

- `ExtensionPageKind` — `unsupported | artist | release | lyrics | tour | email | discovery`
- `ExtensionEntityKind` — `profile | release | tourDate`
- `ExtensionContextSummary` — what the extension reports about the page it's on

### Workflows (label submission portals)

- `EXTENSION_WORKFLOW_IDS` — readonly tuple of supported portals: `distrokid_release_form`, `awal_release_form`, `kosign_work_form`
- `ExtensionWorkflowId` — derived union

### Fill / preview / apply / undo

- `ExtensionFillPreviewRequest` / `ExtensionFillPreviewResponse`
- `ExtensionFieldMapping` — per-field status (`ready | blocked | unsupported`) + confidence (`exact | derived | unsupported`)
- `ExtensionApplyResult` + `ExtensionUndoSnapshot` — captured before-state so the extension can undo a fill
- `ExtensionBlocker` — structured blocker with a `fixUrl` deep link back to the web app

### Telemetry

- `ExtensionActionLogRequest` / `ExtensionActionLogResponse` — what the extension POSTs after every action

## Adding a contract

1. Add the type/interface to `index.ts`.
2. Bump downstream consumers (`apps/web` and the extension repo) together — this package is the schema, not the implementation.
3. Prefer additive changes. If a field has to be removed, ship the additive replacement, migrate consumers, then remove in a later release.

## Versioning

This is a private workspace package, version-locked to the rest of the monorepo via the root `VERSION` file. Treat schema changes as you would API changes — extension users may run an older client until they update.
