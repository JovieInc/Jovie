Native Ovie route adapter proposal — source main485542fe / sidebar4b407aac

The accepted registry-derived operator IA excludes creator roots. Latest shared-sidebar spec requires Now, Growth, Product, Operations and Needs You, followed by bounded authorized More. The older JOV-4082 four-primary count is superseded; its registry/exclusivity decision remains applicable.

Admin authorization is sufficient for the current read-navigation inventory: MobileMeResponse.appShell.canAccessOvie and the web page gate derive from the same checkAdminRole; web OPERATOR_NAV_ITEMS maps the full registry. Privacy unlock is separate and session-bound; mutation MFA/entitlement gates remain authoritative. No new per-destination permission API is required.

| Registry ID | Label | Current canonical URL | Existing native destination |
| --- | --- | --- | --- |
| overview | Now | `/hud` | No operator adapter; Chat has workspace-aware native messaging, not canonical private history proof |
| growth | Growth | `/app/ov/growth` | No operator adapter; Chat has workspace-aware native messaging, not canonical private history proof |
| product | Product | `/app/ov/product` | No operator adapter; Chat has workspace-aware native messaging, not canonical private history proof |
| operations | Operations | `/app/ov/operations` | No operator adapter; Chat has workspace-aware native messaging, not canonical private history proof |
| needs_you | Needs You | `/app/ov/needs-you` | No operator adapter; Chat has workspace-aware native messaging, not canonical private history proof |
| chat | Chat | `/app/ov/chat` | No operator adapter; Chat has workspace-aware native messaging, not canonical private history proof |
| certifications | Certifications | `/app/ov/certifications` | No operator adapter; Chat has workspace-aware native messaging, not canonical private history proof |
| shipping | Shipping | `/app/ov/shipping` | No operator adapter; Chat has workspace-aware native messaging, not canonical private history proof |
| people | People | `/app/ov/people` | No operator adapter; Chat has workspace-aware native messaging, not canonical private history proof |
| interviews | Interviews | `/app/ov/interviews` | No operator adapter; Chat has workspace-aware native messaging, not canonical private history proof |
| platform_connections | Platform Connections | `/app/ov/platform-connections` | No operator adapter; Chat has workspace-aware native messaging, not canonical private history proof |
| playlists | Playlists | `/app/ov/playlists` | No operator adapter; Chat has workspace-aware native messaging, not canonical private history proof |
| presence | Presence | `/app/ov/presence` | No operator adapter; Chat has workspace-aware native messaging, not canonical private history proof |
| activity | Timeline | `/app/ov/activity` | No operator adapter; Chat has workspace-aware native messaging, not canonical private history proof |
| investors | Investors | `/app/ov/investors` | No operator adapter; Chat has workspace-aware native messaging, not canonical private history proof |
| feature_registry | Feature Registry | `/app/ov/feature-registry` | No operator adapter; Chat has workspace-aware native messaging, not canonical private history proof |
| costs | Costs | `/app/ov/costs` | No operator adapter; Chat has workspace-aware native messaging, not canonical private history proof |
| revenue_lift | Revenue Lift | `/app/ov/revenue-lift` | No operator adapter; Chat has workspace-aware native messaging, not canonical private history proof |
| share_studio | Share Studio | `/app/ov/share-studio` | No operator adapter; Chat has workspace-aware native messaging, not canonical private history proof |
| features | Features | `/app/ov/features` | No operator adapter; Chat has workspace-aware native messaging, not canonical private history proof |

Compose the existing SwiftUI drawer, typed route/intent policy and canonical registry rather than adding pages or a framework. A native adapter should carry registry ID, the entire first-party destination URL and an explicit destination kind. The operator registry must drive order/labels/routes; allowed host/scheme comes from the existing configured first-party HTTPS origin, never arbitrary registry/user URLs. Reject credentials/foreign hosts. Compare known route prefixes without rewriting path case; preserve raw encoded pathname, ordered duplicate query parameters and fragment. Query-selected views must remain intact. Creator tabs must be excluded in Ovie and operator tabs excluded without canAccessOvie.

Actual native operator capabilities are Summer messaging, workspace-scoped Inbox and card decisions. They do not implement the five operator pages or the full utility inventory. Do not label Inbox as Needs You or creator Home/Work/Audience as operator pages. The current AppShellTab/content adapter has no mounted operator route; the public-profile WKWebView rejects app/hud/auth and uses a nonPersistent data store. Do not widen that policy, transplant cookies/bearer tokens, or invent a native operator page.

Minimum routing dependency: extend the maintained MobileSignedInLinkRoute/IntentNavigation and AppRouteManifest with the chosen operator destination kind. For destinations intentionally remaining web-only, pair MobileWebOnlyRouteBoundary with the maintained AASA NOT exclusions before /app/*; /hud is already outside that wildcard. Old/stale AASA callbacks must reach the same explicit external boundary, preserving the complete URL, instead of the current unmatched deep link. Native /app/ov routes must not be excluded if they actually have a supported native adapter. Shared AASA/auth signatures and canonical production URLs remain unchanged; no new backend API or permission grant.

Mounted/back/active semantics are a required design boundary: an in-app adapter must own its full URL and back stack, keep brand/account anchors fixed, restore native mounted drafts/media on Back, and derive active rows from the actual operator URL including query-view semantics. The current shell has no authenticated protected-page adapter or URL acknowledgement to support that. Intentional Safari handoff preserves the web's own authentication/privacy gates and back state, but a last-launched native link is not the active external page and cannot be presented as seamless native parity or same-account resume. A public-profile browser does not satisfy this dependency.

Verification proposal: existing role/registry tests plus native no-admin/operator-exclusivity cases; round-trip case-sensitive IDs, encoded path, duplicate query, fragment, nested routes, custom-scheme/stale AASA callback and exact configured host rejection; manifest/AASA parity; actual supported destination-kind tests; mount/back/draft/media and active-selection checks; authenticated/locked/expired/replaced-session behavior through existing gates. Add no fabricated live/auth/physical evidence. Use the existing iOS unit/UI and web AASA test selectors with coverage.

Owner boundary: coordinator must reconcile the existing native routing/auth owner for JOV-7632/shared MobileAuthCoordinator and AASA before implementation. Sole sidebar writer remains this chat; no second writer, shared routing edit, backend/API/permission change or public action has occurred. This is a concrete dependency proposal, not an accepted scope reduction or operator-parity completion.
