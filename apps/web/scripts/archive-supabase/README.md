# Supabase Migration Archive

This directory contains archived Supabase-related scripts and utilities from the migration to Neon + Drizzle ORM.

## Historical Context

Jovie previously used Supabase as the primary database provider. In 2024, we migrated to:
- **Neon** for PostgreSQL hosting (better Edge runtime support)
- **Drizzle ORM** for type-safe database queries
- **@neondatabase/serverless** for HTTP-based pooling

## Archived Files

All files in this directory are **deprecated and no longer used** in production. They are preserved for:
- Historical reference
- Understanding past architecture decisions
- Potential data recovery scenarios

## Current Database Stack

See the main documentation for current database patterns:
- [Database Guide](../../docs/DATABASE.md) - Neon + Drizzle usage
- [Migration Guide](../../docs/MIGRATIONS.md) - Schema change process
- [RLS Patterns](../../docs/RLS.md) - Row-level security with Neon

## Why We Migrated

Key reasons for moving from Supabase to Neon:
1. **Edge Runtime Support**: Neon's HTTP driver works with Vercel Edge
2. **Simplicity**: Direct Postgres without Supabase's additional layer
3. **Cost**: More predictable pricing at scale
4. **Control**: Direct access to Postgres features and extensions
5. **YC Principle**: "Do things that don't scale" - removed abstraction layers

## Files Last Updated

This archive was created during the Supabase → Neon migration completed in Q3 2024.

**Do not use these files in production.**
