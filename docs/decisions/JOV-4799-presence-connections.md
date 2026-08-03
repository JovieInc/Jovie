# JOV-4799: Presence and Connections IA

## Decision

Presence is the primary product destination for what is true about an artist now:
DSP profiles, social networks, public pages, search rank, answer-engine visibility,
and monitoring signals. Its canonical route is `/app/profiles`; `/app/presence`
remains a legacy alias to that workspace.

Connections is a Settings destination for account-level integrations and OAuth
status, beginning with Gmail and Google Calendar. Its canonical route is
`/app/settings/connectors`, whose user-facing label is Connections.

## Boundary

Provider plumbing is shared. Presence does not render Gmail or account connector
rows, and Connections does not become a second artist-presence workspace.

For a single artist, artist-owned destinations stay flat in the sidebar. For
multiple artists, Library, Contacts, Calendar, and Presence sit under the selected
artist's collapsible group so scope is visible without adding redundant hierarchy
for the common case.

Public marketing may interlink an artist-profile outcome to a dedicated feature
page only when the relationship is material and supportable. Artist Profiles links
to Fan Notifications and Instant Merch because both turn profile discovery into a
specific next action; descriptive search/AEO and audience-quality claims remain
unlinked until they have dedicated canonical pages.

## Out of scope

This slice does not add providers, Gmail behavior, rank-provider infrastructure,
or automatic SEO/AEO remediation. Presence summarizes available signals and makes
the product boundary explicit; measured rank expansion and automated boosting
remain separately gated capabilities.
