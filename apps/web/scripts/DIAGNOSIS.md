# Waitlist API Debug Diagnosis

## What I Found

After testing the `/api/waitlist` endpoint, I discovered several key issues:

### 1. **401 Unauthorized Response**
When testing the endpoint without authentication, it correctly returns:
```json
{
  "success": false,
  "error": "Unauthorized"
}
```
This is expected behavior - the route requires Clerk authentication.

### 2. **Hot Reload Not Working**
The debug `console.log` statements I added to the route handler **never appeared in server logs**, even though:
- The statements exist in the source file (verified with grep)
- Multiple restart/touch attempts were made
- The server shows `POST /api/waitlist 200 in 192ms` (indicating requests are being processed)

**This is the core problem**: Next.js is serving a **cached/compiled version** of the route that doesn't include the new logging statements.

### 3. **Schema Mismatch Was a Red Herring**
Initially thought there was a schema mismatch, but verified that both client and API expect the same fields:
- `primaryGoal`
- `primarySocialUrl`
- `spotifyUrl`
- `heardAbout`
- `selectedPlan`

## Root Cause

The `.next` build cache contained a stale compiled version of the route handler. Next.js's hot module replacement (HMR) failed to recompile the route when changes were made.

## What I Did

1. **Cleared `.next` cache**: Deleted the entire `.next` directory to force full recompilation
2. **Added diagnostic logging**:
   - Module-level log to verify file is loaded (line 23)
   - Function-level logs throughout the POST handler
3. **Created test script**: `scripts/test-waitlist-api.mjs` to test the endpoint directly

## Next Steps - RESTART YOUR SERVER

**You MUST restart the dev server** for these changes to take effect:

```bash
# Stop your current dev server (Ctrl+C)
# Then restart:
doppler run -- pnpm dev
```

## What You Should See After Restart

When the dev server starts, you should immediately see:
```
[Waitlist Route Module] Loaded at 2026-01-08T...
```

This confirms the new code is being executed.

## Testing After Restart

1. **Submit the waitlist form again** through the browser
2. **You should now see detailed logs** in the server terminal:
   ```
   [Waitlist API] POST request received
   [Waitlist API] User ID: user_xxxxx
   [Waitlist API] Starting transaction for new entry
   [Waitlist API] Inserting waitlist entry for: email@example.com
   [Waitlist API] Waitlist entry created: uuid-here
   [Waitlist API] Finding available handle for: handlename
   [Waitlist API] Using username: handlename
   [Waitlist API] Creating profile: { username: ..., displayName: ... }
   [Waitlist API] Profile created successfully
   [Waitlist API] Upserting user record for: user_xxxxx
   [Waitlist API] User record upserted successfully
   ```

3. **If you see an error**, the logs will show exactly where it fails
4. **Check database** to verify records were created:
   ```bash
   node scripts/check-last-signup.mjs
   ```

## If It Still Doesn't Work

If you still see `POST /api/waitlist 200` but **no console logs**:

1. Check if there's a reverse proxy/middleware intercepting requests
2. Verify `app/api/waitlist/route.ts` hasn't been reverted
3. Run: `grep -n "console.log" app/api/waitlist/route.ts` to confirm logs exist
4. Try: `rm -rf .next && doppler run -- pnpm dev` (nuclear option)

## Browser Error Explanation

The browser error you saw:
```
SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

This happens when:
- API returns HTML error page instead of JSON
- Usually means middleware is redirecting or there's an auth issue
- Should be resolved once you're properly authenticated and route is recompiled
