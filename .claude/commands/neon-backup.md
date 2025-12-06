---
description: Create a manual backup of a Neon database branch
tags: [database, backup, neon, safety]
---

# Create Neon Database Backup

Create a point-in-time backup of a Neon database branch before risky operations.

## Prerequisites

Ask the user which environment they want to backup:
- **main** - Staging/main branch database
- **production** - Production database
- **preview** - Preview environment

## Steps

1. **Identify Current State**
   - List available Neon branches
   - Show current schema version
   - Display recent activity/changes

2. **Create Branch Backup**
   - Use Neon branching to create a snapshot
   - Name format: `backup-[environment]-[YYYY-MM-DD-HHmm]`
   - Preserve current state before migration

3. **Verify Backup**
   - Confirm branch was created
   - Show branch details (size, timestamp)
   - Provide restoration instructions

## Backup Strategy

Neon uses copy-on-write branching:
- Instant snapshot creation
- No storage cost until data diverges
- Point-in-time recovery available

## Restoration

If needed, restore by:
1. Identifying backup branch
2. Promoting backup to main/production
3. Updating connection strings

## Note

This creates a branch-based backup. For long-term archival:
- Use Neon's built-in point-in-time restore (default: 7 days)
- Consider exporting schema + data for critical backups
- Production has automatic daily backups
