# Clerk-Supabase Integration Guide

This document outlines the new Clerk integration method with Supabase, following the latest best practices from [Clerk's official documentation](https://clerk.com/docs/raw/integrations/databases/supabase.mdx).

## Overview

We've migrated from the old Clerk integration method to the new approach that uses:

- `createClerkClient()` from `@clerk/backend` for server-side operations
- JWT verification in Supabase for secure authentication
- Updated client-side hooks for better integration

## What Changed

### 1. Server-Side Integration (`lib/supabase-server.ts`)

**Before:**

```typescript
import { auth } from '@clerk/nextjs/server';

export async function createAuthenticatedServerClient() {
  const { getToken } = await auth();
  const token = await getToken({ template: 'supabase' });
  // ...
}
```

**After:**

```typescript
import { createClerkClient } from '@clerk/backend';

const clerk = createClerkClient({ secretKey: clerkSecretKey });

export async function createAuthenticatedServerClient() {
  const token = await clerk.sessions.getToken({
    template: 'supabase',
  });
  // ...
}
```

### 2. Client-Side Integration (`lib/supabase.ts`)

**Before:**

```typescript
import { useAuth } from '@clerk/nextjs';

export function useSupabase() {
  const { getToken } = useAuth();
  // ...
}
```

**After:**

```typescript
import { useAuth } from '@clerk/nextjs';

export function useAuthenticatedSupabase() {
  const { getToken } = useAuth();

  const getAuthenticatedClient = async () => {
    const token = await getToken({ template: 'supabase' });
    // ...
  };

  return { getAuthenticatedClient, supabase };
}
```

### 3. Database JWT Verification

Added new migration `20250805190410_add_clerk_jwt_verification.sql` that:

- Creates JWT verification functions in Supabase
- Updates RLS policies to use the new verification
- Provides helper functions for user identification

## Environment Variables

Make sure you have these environment variables set:

```bash
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Database Setup

### 1. Run the Migration

```bash
supabase db push
```

This will apply the JWT verification migration.

### 2. Configure Clerk JWT Template

In your Clerk dashboard:

1. Go to **JWT Templates**
2. Create a new template called `supabase`
3. Set the template to:

```json
{
  "aud": "https://your-project.supabase.co",
  "iss": "https://your-domain.clerk.accounts.dev",
  "sub": "{{user.id}}",
  "exp": "{{exp}}",
  "iat": "{{iat}}",
  "nbf": "{{nbf}}"
}
```

### 3. Update Supabase Settings

In your Supabase dashboard:

1. Go to **Settings** > **API**
2. Set the JWT secret to your Clerk JWT secret
3. Configure the JWT expiry time (recommend 1 hour)

## Component Updates

All dashboard components have been updated to use the new integration:

### Before:

```typescript
import { useAuth } from '@clerk/nextjs';
import { getAuthenticatedClient } from '@/lib/supabase';

export function MyComponent() {
  const { getToken } = useAuth();

  const handleSubmit = async () => {
    const token = await getToken({ template: 'supabase' });
    const supabase = await getAuthenticatedClient(token);
    // ...
  };
}
```

### After:

```typescript
import { useAuthenticatedSupabase } from '@/lib/supabase';

export function MyComponent() {
  const { getAuthenticatedClient } = useAuthenticatedSupabase();

  const handleSubmit = async () => {
    const supabase = await getAuthenticatedClient();
    // ...
  };
}
```

## Updated Components

- ✅ `OnboardingForm.tsx`
- ✅ `ListenNowForm.tsx`
- ✅ `ProfileForm.tsx`
- ✅ `SocialsForm.tsx`
- ✅ `AnalyticsCards.tsx`

## Security Benefits

### 1. Server-Side Security

- Uses `createClerkClient()` for secure server-side operations
- Proper JWT verification in Supabase
- No client-side token exposure

### 2. RLS Policy Updates

- Policies now use `auth.current_clerk_id()` function
- More secure user identification
- Better separation of concerns

### 3. JWT Verification

- Validates token expiration
- Checks issuer and audience claims
- Prevents token tampering

## Testing

### 1. Local Development

```bash
npm run dev
```

### 2. Test Authentication Flow

1. Sign up/in with Clerk
2. Verify user creation in Supabase
3. Test dashboard functionality
4. Check RLS policies work correctly

### 3. Test JWT Verification

```sql
-- In Supabase SQL editor
SELECT auth.current_clerk_id();
SELECT auth.current_user_id();
```

## Troubleshooting

### Common Issues

1. **JWT Verification Fails**
   - Check Clerk JWT template configuration
   - Verify Supabase JWT secret matches Clerk
   - Ensure proper audience and issuer claims

2. **RLS Policies Not Working**
   - Verify JWT verification functions are created
   - Check user has proper permissions
   - Test with `auth.current_clerk_id()` function

3. **Client-Side Errors**
   - Ensure `useAuthenticatedSupabase` hook is used
   - Check token template is named `supabase`
   - Verify environment variables are set

### Debug Steps

1. **Check JWT Token**

```typescript
// In browser console
const token = await getToken({ template: 'supabase' });
console.log('JWT Token:', token);
```

2. **Test Supabase Connection**

```typescript
const supabase = await getAuthenticatedClient();
const { data, error } = await supabase.from('users').select('*');
console.log('Users:', data, error);
```

3. **Verify RLS Policies**

```sql
-- In Supabase SQL editor
SELECT * FROM users WHERE clerk_id = auth.current_clerk_id();
```

## Migration Checklist

- [ ] Update environment variables
- [ ] Run database migration
- [ ] Configure Clerk JWT template
- [ ] Update Supabase JWT settings
- [ ] Test authentication flow
- [ ] Verify RLS policies
- [ ] Test all dashboard components
- [ ] Deploy to production

## Production Deployment

1. **Update Environment Variables**
   - Set production Clerk keys
   - Update Supabase URL and keys

2. **Run Migration**

   ```bash
   supabase db push --project-ref your-project-ref
   ```

3. **Test Production**
   - Verify authentication works
   - Test all user flows
   - Monitor for errors

## Support

For issues with this integration:

1. Check Clerk's [official Supabase integration docs](https://clerk.com/docs/raw/integrations/databases/supabase.mdx)
2. Review Supabase [RLS documentation](https://supabase.com/docs/guides/auth/row-level-security)
3. Check Clerk's [JWT templates guide](https://clerk.com/docs/backend-requests/making/jwt-templates)
