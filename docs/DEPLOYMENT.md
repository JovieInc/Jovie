# Deployment Guide - Auth Migration

## Simple Deploy (Zero Users)

Since the database is empty, we can skip all validation and just deploy directly.

### Steps

1. **Merge PR to main**
   ```bash
   # PR will auto-deploy via CI/CD
   ```

2. **Run migrations**
   ```bash
   cd apps/web
   pnpm drizzle:migrate
   ```

3. **Verify**
   ```bash
   # Test the flows:
   # - Signup → Waitlist
   # - Admin approve
   # - Claim profile
   # - Complete onboarding
   ```

That's it!

### What Changed

- Single `userStatus` enum (replaces `status` + `waitlistApproval`)
- Unique constraints on emails and usernames
- Removed 'rejected' status (unused)
- Centralized utilities for email/social platform handling
- Fail-fast error handling

### Rollback

If needed:
```bash
git revert HEAD
git push
```

Old columns still exist, so old code would work.

### Future Work (2-4 weeks after stable)

1. Implement proper `deriveUserStatus()` helper (see TODO in `apps/web/lib/auth/gate.ts:118-131`)
2. Create migration to drop deprecated columns (`status`, `waitlistApproval`)
