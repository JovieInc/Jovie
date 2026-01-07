# Auth Migration - Deployment Checklist

## ✅ Pre-Deployment Validation

### Step 1: Run Validation Queries

Execute all queries in [PRE_DEPLOYMENT_VALIDATION.sql](PRE_DEPLOYMENT_VALIDATION.sql) against your production database.

**Critical Checks:**
- [ ] No duplicate emails in `waitlist_entries` (Query #1)
- [ ] No duplicate usernames in `creator_profiles` (Query #2)
- [ ] All users have `userStatus` set (Query #3)
- [ ] Verify status field mapping (Query #6)

**If any validation fails:**
1. Fix the data issues manually
2. Re-run validation queries
3. Do not proceed until all checks pass

### Step 2: Create Database Backup

```bash
# Create backup before migration
pg_dump $DATABASE_URL > backup-pre-auth-migration-$(date +%Y%m%d).sql

# Or use Neon's backup feature
# https://neon.tech/docs/manage/backups
```

### Step 3: Review Changes

- [ ] Review [AUTH_MIGRATION_SUMMARY.md](AUTH_MIGRATION_SUMMARY.md)
- [ ] Check all modified files compile without errors
- [ ] Review migration files: 0035, 0036, 0037

---

## 🚀 Deployment Steps

### Step 1: Deploy Code Changes

```bash
# Review changes
git status
git diff

# Commit changes
git add .
git commit -m "feat: complete auth migration to single userStatus enum

- Migrate from dual-field (status + waitlistApproval) to single userStatus enum
- Add shared utilities for email normalization and platform detection
- Remove silent error fallbacks (fail fast)
- Add unique constraints on emails and usernames
- Remove unused 'rejected' status from waitlist enum
- Update stored procedures to use new lifecycle enum
- Fix claim flow to set proper profile_claimed status

Closes: #[issue-number]"

# Push to remote
git push origin [your-branch]

# Create PR or merge to main
```

### Step 2: Run Migrations

**⚠️ IMPORTANT: Run migrations in order!**

```bash
# Navigate to web app directory
cd apps/web

# Run migrations
pnpm drizzle:migrate

# Or if using drizzle-kit directly:
pnpm drizzle-kit migrate
```

**Migrations will run in this order:**
1. `0035_auth_migration_constraints.sql` - Adds unique constraints, removes 'rejected' enum
2. `0036_deprecate_old_status_fields.sql` - Adds comments, drops old indexes
3. `0037_update_stored_procedures.sql` - Updates stored function

**Expected Output:**
```
✓ Migration 0035_auth_migration_constraints applied successfully
✓ Migration 0036_deprecate_old_status_fields applied successfully
✓ Migration 0037_update_stored_procedures applied successfully
```

**If migration fails:**
- Check error message
- Verify validation queries passed
- Check for locked tables or active transactions
- See Rollback Plan below

### Step 3: Verify Deployment

Run these queries to verify migration succeeded:

```sql
-- 1. Check indexes were created
SELECT indexname
FROM pg_indexes
WHERE tablename IN ('waitlist_entries', 'creator_profiles')
  AND indexname LIKE '%unique%';
-- Should show: idx_waitlist_entries_email_unique, idx_creator_profiles_username_unique

-- 2. Verify old indexes were dropped
SELECT indexname
FROM pg_indexes
WHERE tablename = 'users'
  AND indexname IN ('idx_users_status', 'idx_users_waitlist_approval');
-- Should return 0 rows

-- 3. Check enum was updated
SELECT unnest(enum_range(NULL::waitlist_status))::text as status_value;
-- Should show: new, invited, claimed (NO 'rejected')

-- 4. Verify stored function was updated
SELECT prosrc
FROM pg_proc
WHERE proname = 'create_profile_with_user';
-- Should contain 'user_status' not 'waitlist_approval'
```

---

## 📊 Post-Deployment Monitoring

### First 1 Hour

Monitor these metrics closely:

- [ ] **Auth Success Rate**: Should remain at baseline (~95%+)
- [ ] **Error Logs**: Check for new errors in `/api/waitlist`, claim flow, onboarding
- [ ] **Constraint Violations**: Should be 0 (unique constraint errors)

**Dashboard Queries:**
```sql
-- Auth success rate (last hour)
SELECT
  COUNT(CASE WHEN user_status IS NOT NULL THEN 1 END)::float / COUNT(*)::float * 100 as success_rate_pct
FROM users
WHERE created_at > now() - interval '1 hour';

-- New signups (last hour)
SELECT
  user_status,
  COUNT(*) as count
FROM users
WHERE created_at > now() - interval '1 hour'
GROUP BY user_status;

-- Waitlist submissions (last hour)
SELECT
  status,
  COUNT(*) as count
FROM waitlist_entries
WHERE created_at > now() - interval '1 hour'
GROUP BY status;
```

### First 24 Hours

- [ ] Check error tracking (Sentry/similar) for spikes
- [ ] Monitor auth-related endpoints response times
- [ ] Verify onboarding completion rate unchanged
- [ ] Check for any constraint violation errors

### First Week

- [ ] Verify no regressions in user metrics
- [ ] Confirm all status transitions working correctly
- [ ] Check for edge cases or unexpected states

---

## 🔙 Rollback Plan

### If Code Issues Occur

**Quick Rollback (Recommended for code bugs):**
```bash
# Revert to previous version
git revert HEAD
git push

# Or reset to previous commit
git reset --hard HEAD~1
git push --force
```

**Why safe:** Old database columns still exist, so old code will work.

### If Migration Issues Occur

**⚠️ Only if absolutely necessary**

```sql
-- ROLLBACK STEP 1: Drop new constraints
DROP INDEX IF EXISTS idx_waitlist_entries_email_unique;
DROP INDEX IF EXISTS idx_creator_profiles_username_unique;

-- ROLLBACK STEP 2: Restore old indexes
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_waitlist_approval ON users(waitlist_approval);
CREATE INDEX IF NOT EXISTS idx_users_waitlist_entry_id ON users(waitlist_entry_id);

-- ROLLBACK STEP 3: Revert enum (complex - avoid if possible)
-- This requires re-creating the enum with 'rejected' value
-- Contact DBA if needed

-- ROLLBACK STEP 4: Restore old stored procedure
-- Check git history for previous version of create_profile_with_user
```

**Database Restore (Last Resort):**
```bash
# Restore from backup created in pre-deployment
psql $DATABASE_URL < backup-pre-auth-migration-YYYYMMDD.sql
```

---

## 🎯 Success Criteria

Deployment is successful when:

- ✅ All migrations applied without errors
- ✅ No new errors in logs related to auth/waitlist/onboarding
- ✅ Auth success rate at baseline (within 2%)
- ✅ Onboarding completion rate at baseline (within 5%)
- ✅ Zero constraint violation errors
- ✅ Users can sign up, join waitlist, claim profiles, complete onboarding
- ✅ Admin can approve waitlist entries

---

## 📅 Post-Stabilization (2-4 Weeks)

After migration has been stable for 2-4 weeks:

### Create Final Cleanup Migration

```sql
-- Migration: 0038_remove_deprecated_status_fields.sql
-- Remove deprecated columns after code has stabilized

ALTER TABLE users DROP COLUMN IF EXISTS status;
ALTER TABLE users DROP COLUMN IF EXISTS waitlist_approval;
-- Keep waitlist_entry_id for historical data

-- Remove deprecated enum types
DROP TYPE IF EXISTS user_status CASCADE;
DROP TYPE IF EXISTS user_waitlist_approval CASCADE;
```

### Update Schema Files

Remove deprecated field definitions from:
- [apps/web/lib/db/schema/auth.ts](apps/web/lib/db/schema/auth.ts)
- [apps/web/lib/db/schema/enums.ts](apps/web/lib/db/schema/enums.ts)

---

## 📞 Support

**If Issues Occur:**

1. Check [AUTH_MIGRATION_SUMMARY.md](AUTH_MIGRATION_SUMMARY.md) for context
2. Review error logs and identify failing component
3. Use rollback plan if needed
4. Document the issue for future reference

**Common Issues:**

| Issue | Cause | Solution |
|-------|-------|----------|
| Constraint violation on insert | Duplicate email/username | Check for duplicates, add unique suffix |
| "Column does not exist" error | Migration not applied | Run `pnpm drizzle:migrate` |
| Auth flow broken | Code deployed before migration | Run migrations, or rollback code |
| Users stuck in wrong state | userStatus logic issue | Check resolveUserState() function |

---

## ✅ Final Checklist

Before marking deployment complete:

- [ ] All pre-deployment validations passed
- [ ] Database backup created
- [ ] Code deployed successfully
- [ ] Migrations ran without errors
- [ ] Post-deployment verification queries passed
- [ ] Monitoring shows no issues (1 hour)
- [ ] No spike in error logs
- [ ] Auth/onboarding flows tested manually
- [ ] Team notified of deployment

**Deployment Date:** ________________

**Deployed By:** ________________

**Notes:** ________________________________________________
