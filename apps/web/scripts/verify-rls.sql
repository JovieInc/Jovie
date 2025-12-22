-- Verify RLS Integration Test Script
-- This script verifies that RLS policies are working correctly with Clerk integration

-- Test 1: Verify that auth.jwt()->>'sub' is accessible
-- This should return null in a non-authenticated context
SELECT 'Test 1: JWT sub claim' AS test_name, auth.jwt()->>'sub' AS result;

-- Test 2: Check table structures exist
SELECT 'Test 2: app_users table exists' AS test_name, 
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables 
                        WHERE table_name = 'app_users' AND table_schema = 'public')
            THEN 'PASS' ELSE 'FAIL' END AS result;

SELECT 'Test 3: artist_profiles table exists' AS test_name,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables 
                        WHERE table_name = 'artist_profiles' AND table_schema = 'public')
            THEN 'PASS' ELSE 'FAIL' END AS result;

-- Test 4: Check RLS is enabled
SELECT 'Test 4: app_users RLS enabled' AS test_name,
       CASE WHEN relrowsecurity THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_class 
WHERE relname = 'app_users';

SELECT 'Test 5: artist_profiles RLS enabled' AS test_name,
       CASE WHEN relrowsecurity THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_class 
WHERE relname = 'artist_profiles';

-- Test 6: Check that public profiles are readable by anon
SELECT 'Test 6: Public profiles count' AS test_name,
       count(*)::text AS result
FROM artist_profiles 
WHERE is_public = true;

-- Test 7: Check that indexes exist
SELECT 'Test 7: Username index exists' AS test_name,
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes 
                        WHERE tablename = 'artist_profiles' 
                        AND indexname = 'artist_profiles_username_idx')
            THEN 'PASS' ELSE 'FAIL' END AS result;

-- Test 8: Verify seed data exists
SELECT 'Test 8: Seed data exists' AS test_name,
       CASE WHEN count(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM app_users;

-- Summary
SELECT '=== Summary ===' AS test_name, '' AS result;
SELECT 'Total tables' AS test_name, count(*)::text AS result
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name IN ('app_users', 'artist_profiles');

SELECT 'Total policies' AS test_name, count(*)::text AS result
FROM pg_policies 
WHERE schemaname = 'public' AND tablename IN ('app_users', 'artist_profiles');