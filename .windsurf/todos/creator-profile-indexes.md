---
description: Creator profile performance indexes
---
1) Generate Drizzle migration adding indexes:
   - creator_profiles(username_normalized)
   - social_links(creator_profile_id, sort_order)
   - creator_contacts(creator_profile_id, is_active, sort_order)
2) Verify migration is recorded in drizzle/migrations/meta/_journal.json.
3) Sanity-check migration SQL for concurrent safety guidelines.
