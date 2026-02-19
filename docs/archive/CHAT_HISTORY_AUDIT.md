# Chat History Implementation Audit

**Date:** 2026-02-06
**Scope:** Full audit of chat history persistence, API routes, client components, and state management

## Architecture Overview

The chat system spans ~35 files across 5 layers:
- **DB Schema:** `lib/db/schema/chat.ts` — 3 tables (`chatConversations`, `chatMessages`, `chatAuditLog`)
- **API Routes:** 5 endpoints under `app/api/chat/`
- **React Query Hooks:** 5 hooks for data fetching and mutations
- **Core Chat Logic:** `useJovieChat` hook + `InlineChatArea` component
- **UI Components:** `JovieChat`, `ChatMessage`, `ChatInput`, `ErrorDisplay`, `SuggestedPrompts`, `ProfileEditPreviewCard`

## Findings

### CRITICAL

#### 1. Race Condition in Message Persistence

**Files:** `components/jovie/hooks/useJovieChat.ts:137-197`, `components/dashboard/organisms/InlineChatArea.tsx:240-290`

In `InlineChatArea.tsx`, two separate `useEffect` hooks both trigger on `status === 'ready'`:
- Lines 240-275: Persists messages to DB
- Lines 278-290: Extracts assistant message text from parts

The extraction effect may run **after** the persistence effect, meaning `assistantMessage` is still `''` when the save fires. The `if (userMessage && assistantMessage)` guard silently skips persistence, causing **message loss**.

In `useJovieChat.ts`, this was consolidated into a single effect, which is better but still has a timing gap if React batches the `messages` state update.

**Recommendation:** Ensure assistant message extraction completes before attempting persistence. Consider using a ref-based flag or combining the logic with a guard that checks message parts directly rather than relying on a pre-populated ref value.

#### 2. Duplicated Chat Logic (DRY Violation)

**File:** `components/dashboard/organisms/InlineChatArea.tsx`

`InlineChatArea` duplicates substantial logic from `useJovieChat`:
- `ArtistContext` type (redefined instead of imported from `types.ts`)
- `ChatError` / `ChatErrorType` types (redefined)
- `getErrorType()` — uses weaker substring matching vs. word-boundary regex in `utils.ts`
- `getUserFriendlyMessage()` — redefined
- `getMessageText()` — redefined
- Full conversation creation + message persistence flow
- Missing throttle protection that `useJovieChat` has

Bug fixes to one path won't propagate to the other.

**Recommendation:** Refactor `InlineChatArea` to use `useJovieChat` hook, or extract the shared persistence and error logic into a shared module.

### HIGH

#### 3. No Pagination for Messages

**File:** `app/api/chat/conversations/[id]/route.ts:55-65`

All messages are fetched with no `LIMIT` clause. Long conversations will return increasingly large payloads. With no cap on total messages per conversation, this will degrade performance over time.

**Recommendation:** Add cursor-based or offset pagination with a reasonable default (e.g., 100 messages) and support for loading older messages.

#### 4. Artist Context Trusted from Client

**File:** `app/api/chat/route.ts:308-313, 339`

The `artistContext` is sent from the client and injected directly into the system prompt with only a `typeof === 'object'` check. A malicious client could inject arbitrary data (fake stats, prompt injection via `displayName` or `bio`).

**Recommendation:** Fetch artist context server-side using the authenticated user's profile ID. Remove `artistContext` from the request body.

#### 5. Incomplete Audit Log

**File:** `app/api/chat/confirm-edit/route.ts:112-119`

The audit log insert omits `conversationId`, `messageId`, `ipAddress`, and `userAgent` — all columns that exist in the schema specifically for traceability.

**Recommendation:** Accept `conversationId` and `messageId` in the request body, and extract IP/user-agent from request headers.

### MEDIUM

#### 6. No Stream Abort Handling

The streaming chat transport doesn't handle abort/cancellation. If the user navigates away mid-stream, the Anthropic API call continues consuming tokens until `maxDuration` (30s).

**Recommendation:** Pass an `AbortSignal` to the transport and ensure cleanup on unmount.

#### 7. `console.error` Instead of Logger

**File:** `app/api/chat/confirm-edit/route.ts:130`

Uses `console.error` directly while all other chat routes use the structured `logger.error()`. Also doesn't report to Sentry.

**Recommendation:** Replace with `logger.error()` and add Sentry capture.

#### 8. No Conversation Count Limit

No limit on conversations per user. Rate limiting only covers AI messages (30/hour), but unlimited empty conversations can be created via `POST /api/chat/conversations`.

**Recommendation:** Add a per-user conversation limit or rate limit on conversation creation.

#### 9. Initial Message Not Length-Validated

**File:** `app/api/chat/conversations/route.ts:102-108`

When creating a conversation with an `initialMessage`, the content length is not validated. The messages endpoint validates 50,000 chars and the streaming endpoint validates 4,000 chars, but this path has no validation.

**Recommendation:** Add length validation consistent with the messages endpoint.

### LOW

#### 10. Tool Calls Not Persisted

**File:** `components/jovie/hooks/useJovieChat.ts:147-149`

Only text parts are extracted for persistence. Tool call parts (profile edit suggestions) are stripped. When conversations are reloaded, tool call UI cards won't render. The `chatMessages.toolCalls` jsonb column exists but is never populated from the client-side persistence path.

**Recommendation:** Include tool call data in the persisted message payload.

#### 11. NaN Parsing for Limit Parameter

**File:** `app/api/chat/conversations/route.ts:32`

`parseInt("abc", 10)` returns `NaN`, and `Math.min(NaN, 50)` is `NaN`. This would be passed to Drizzle's `.limit()`.

**Recommendation:** Add `Number.isFinite()` guard after parsing.

#### 12. CORS Header Inconsistency

The conversations routes use `NO_STORE_HEADERS` with session auth, while the streaming and confirm-edit routes use `CORS_HEADERS` with Clerk auth. Review whether CORS headers are actually needed on the streaming/edit routes.

## Summary Table

| Severity | # | Key Issues |
|----------|---|------------|
| Critical | 2 | Persistence race condition; duplicated chat logic |
| High     | 3 | No message pagination; client-trusted artist context; incomplete audit log |
| Medium   | 4 | No abort handling; console.error; no conversation limit; unvalidated initial message |
| Low      | 3 | Tool calls not persisted; NaN limit; CORS inconsistency |

## Recommended Priority Order

1. Fix persistence race condition (Critical — messages silently lost)
2. Refactor InlineChatArea to share logic with useJovieChat (Critical — prevents divergent bugs)
3. Fetch artist context server-side (High — prompt injection risk)
4. Add message pagination (High — performance degradation over time)
5. Complete audit log fields (High — security traceability)
6. Remaining medium/low items
