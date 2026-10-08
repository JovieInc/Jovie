# Shared integrations Settings contract

Owner: JOV-8012 (bounded implementation child of JOV-7363). Source base:
`2c362689356081876303b9e01944af899091f231`, 2026-10-07.

Reading this as: macOS ops cockpit for Jovie operators, with a calm dense native
language, leaning toward Linear-style product UI adapted to macOS.

## Reuse boundary

EXTEND the existing `lib/connectors/{types,registry,token-vault}` substrate.
One provider manifest owns operation IDs, labels, exact required scopes,
read/write mode, action approval, implemented availability, platform and
account scope. `capabilities.ts` projects permissions and public capability
copy from that manifest. `availability.server.ts` exposes safe configuration
booleans only. No provider credentials cross into UI or marketing.

Customer `/app/settings/connectors` and operator `/app/ov/integrations` consume
`SettingsIntegrationsPage`, the same connection loader and `ConnectorsClient`.
The operator entry adds existing admin/privacy authorization and the canonical
Settings layout. It creates no product loader, OAuth path or connection model.
Existing publisher/playlist operational controls remain operator capabilities.

## User task and interaction

Find Integrations in Settings, then Connect/Reconnect. Provider consent opens
through the existing OAuth path and returns to the originating surface.
Disconnect remains available even if new OAuth setup is unavailable or access
needs recovery. Account identity and scope, granted permissions, partial
capabilities and recorded last sync explain what is usable. A granted scope is
not an operation-success receipt or authority to send, publish or upload.

Idle, disconnected, connected, partial permissions, syncing, reauth, error,
unavailable configuration/read and pending actions have explicit UI states.
Semantic buttons support pointer and keyboard. Pending changes keep the action
width and status slot; duplicate disconnects are disabled and failed requests
retain retry. Google Gmail/Calendar share their existing OAuth connection; UI
explains that disconnecting either removes both. YouTube requires the exact
selected identity. Other identity-bound rows never leak across selection.

## Existing identity limitation

Current Gmail/Calendar/Spotify accounts can be user-wide. They are labeled as
signed-in-account connections, not falsely certified company-owned accounts.
YouTube is identity-scoped. Company identity provisioning and full multi-finality
commissioning remain acceptance requirements of JOV-6891. JOV-6597 owns incremental
least-privilege OAuth grants; this slice records operation-specific scope truth
without silently changing provider consent or enabling unsupported providers.

## Marketing and cross-product mapping

The static public `/integrations` directory projects deployment configuration and
implemented available operations. Rebuild when provider configuration changes;
Settings checks live availability. Planned/blocked operations and unsupported
platforms are filtered. Generated directory content is application reference,
not an independent manually curated marketing promise list (JOV-6259/JOV-4069).

Log Your Body owns native adapters and its existing registry (LYB-59/80/81).
Map the same fields and states into its native Integrations screen. BodySpec
and HealthKit are provider implementations of product-specific facts/actions.
HealthKit uses native permission/device capability, not OAuth. Mac must list
actual platform restrictions and an implemented phone/sync handoff only when
its owner has verified that path. No new cross-product service or token store.
The LYB implementation and platform receipt must come from its separate owner;
this document does not certify those capabilities.

## Decision receipt

Ship now: shared manifest and Settings truth/recovery behavior, generated public
projection, and a thin authorized operator wrapper.
Re-evaluate when: a provider/platform capability or account ownership boundary
changes, or an operation lacks verified availability.
Then: update the existing manifest/adapter and its behavior tests before exposing
or advertising the operation. Broad epics require their own runtime receipts.
