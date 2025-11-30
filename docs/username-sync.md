# Username and Clerk Synchronization

This document describes how usernames are synchronized between Jovie and Clerk.

## Source of truth

- Jovie is the canonical source of truth for usernames.
- The canonical value is `creatorProfiles.usernameNormalized`.
- Clerk is kept in sync with this value via dedicated helpers.

## Jovie → Clerk

Application flows that change a username (onboarding and dashboard profile update) must call `syncCanonicalUsernameFromApp`.

- Validates and normalizes the proposed username using the shared validation utilities.
- Ensures the normalized username is not already taken in `creator_profiles`.
- Updates `creatorProfiles.username` and `creatorProfiles.usernameNormalized` in a transaction scoped to the current Clerk user.
- Updates `clerk.user.username` to the canonical normalized username.
- Stores `jovie_username_normalized` in Clerk private metadata so future events know the last canonical value.
- Throws a `UsernameValidationError` when the username is invalid or already taken, so callers can surface a 400-style error.

## Clerk → Jovie

Clerk-hosted profile changes flow through the `user.updated` webhook and `syncUsernameFromClerkEvent`.

- The webhook handler passes `user.id`, `user.username`, and `user.private_metadata` into the helper.
- A guard compares the normalized event username to `jovie_username_normalized` in private metadata and no-ops if they already match, which prevents update loops.
- The helper validates and normalizes the incoming username.
- On invalid format:
  - If `jovie_username_normalized` exists, Clerk `user.username` is reverted to that canonical value.
  - The Jovie database is left unchanged.
- On conflict (username already taken by another profile):
  - The database value wins.
  - Clerk `user.username` is set back to the canonical DB username.
- On success (valid and available):
  - Updates `creatorProfiles.username` and `creatorProfiles.usernameNormalized` for that user.
  - Updates Clerk `user.username` and `jovie_username_normalized` in private metadata to the new canonical value.

## Failure handling

- Sync failures in the Clerk webhook handler are logged and return HTTP 200 with an error payload so Clerk does not retry non-critical sync issues.
- Application entry points should treat `UsernameValidationError` as a validation failure and return a 4xx response with the error message.
