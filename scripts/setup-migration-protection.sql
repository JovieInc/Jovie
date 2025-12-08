-- Migration Protection for Drizzle ORM
-- This script installs database-level protection to ensure all schema changes
-- go through Drizzle migrations, preventing accidental direct DDL.
--
-- Usage: psql $DATABASE_URL -f scripts/setup-migration-protection.sql
--
-- To bypass (emergencies only): SET app.allow_schema_changes = 'true';

-- Ensure drizzle schema exists
CREATE SCHEMA IF NOT EXISTS drizzle;

-- Function to block direct DDL changes
CREATE OR REPLACE FUNCTION drizzle.block_direct_ddl()
RETURNS event_trigger AS $$
DECLARE
    obj record;
    is_drizzle_migration boolean := false;
BEGIN
    -- Check if we're in a Drizzle migration (has lock on migrations table)
    SELECT EXISTS (
        SELECT 1 FROM pg_locks l
        JOIN pg_class c ON l.relation = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relname = '__drizzle_migrations'
        AND n.nspname = 'drizzle'
        AND l.mode = 'RowExclusiveLock'
        AND l.pid = pg_backend_pid()
    ) INTO is_drizzle_migration;
    
    -- Allow Drizzle migrations
    IF is_drizzle_migration THEN
        RETURN;
    END IF;
    
    -- Allow if explicitly permitted via session variable
    IF current_setting('app.allow_schema_changes', true) = 'true' THEN
        RETURN;
    END IF;
    
    -- Allow changes to drizzle schema (for migration tracking)
    FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands()
    LOOP
        IF obj.schema_name = 'drizzle' THEN
            CONTINUE;
        END IF;
        
        -- Block changes to public schema tables
        IF obj.schema_name = 'public' AND obj.object_type IN ('table', 'index', 'sequence', 'type') THEN
            RAISE EXCEPTION 'Direct schema changes are blocked. Use Drizzle migrations instead: pnpm run drizzle:generate';
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create the event trigger (drop first if exists to update)
DROP EVENT TRIGGER IF EXISTS block_direct_ddl_trigger;
CREATE EVENT TRIGGER block_direct_ddl_trigger
ON ddl_command_end
EXECUTE FUNCTION drizzle.block_direct_ddl();

-- Add documentation
COMMENT ON FUNCTION drizzle.block_direct_ddl() IS 
'Blocks direct DDL changes to public schema. All schema changes must go through Drizzle migrations.
To bypass (for emergencies only): SET app.allow_schema_changes = ''true'';';

COMMENT ON EVENT TRIGGER block_direct_ddl_trigger IS
'Prevents direct schema modifications. Use pnpm run drizzle:generate to create migrations.';

-- Verify installation
DO $$
BEGIN
    RAISE NOTICE 'Migration protection installed successfully!';
    RAISE NOTICE 'Direct DDL to public schema is now blocked.';
    RAISE NOTICE 'Use "pnpm run drizzle:generate" to create migrations.';
END $$;
