# TODO - Admin table refresh + contact sync
- [ ] Add per-row "Refresh ingest" button in admin creators table; trigger Linktree ingest for that handle; show loading/toast; refresh row data on success.
- [ ] Move bulk actions control into header aligned above username column; keep header checkbox only; remove redundant bar.
- [ ] Render creator name + username in two lines: bold displayName (fallback username), smaller username below.
- [ ] ContactSidebar should hydrate from creator data: displayName/username/avatar/social links; populate name fields when available.
- [ ] After refresh ingest, update ContactSidebar data to show latest socials/avatar.
- [ ] Run lint/tests if impacted components.
