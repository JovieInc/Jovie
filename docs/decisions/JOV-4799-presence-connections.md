# JOV-4799: Presence and Connections IA

## Decision

Presence is the primary product destination for what is true about an artist now:
DSP profiles, social networks, and monitoring signals. Its canonical route is
`/app/profiles`; `/app/presence` remains a legacy alias to that workspace.

Connections is a Settings destination for account-level integrations and OAuth
status, beginning with Gmail and Google Calendar. Its canonical route is
`/app/settings/connectors`, whose user-facing label is Connections.

## Boundary

Provider plumbing is shared. Presence does not render Gmail or account connector
rows, and Connections does not become a second artist-presence workspace.

## Out of scope

This slice does not add providers, Gmail behavior, or monitoring infrastructure,
and it does not redesign the authenticated shell beyond the naming and routing
boundary above.
