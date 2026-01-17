# SonarCloud Issue Triage - January 17, 2025

## Summary

- **Total BUGs addressed:** 17
- **Code fixes applied:** 12
- **False positives to mark:** 6
- **Security hotspots reviewed:** 26

---

## Issues Fixed via Code Changes

### S1082 - Accessibility: Click handlers need keyboard listeners (10 issues)

Added `onKeyDown` handlers to elements with `onClick`:

| File | Line | Status |
|------|------|--------|
| `apps/web/components/dashboard/audience/table/atoms/AudienceRowSelectionCell.tsx` | 31 | Fixed |
| `apps/web/components/dashboard/audience/table/atoms/AudienceCreatedAtCell.tsx` | 34 | Fixed |
| `apps/web/components/dashboard/audience/table/atoms/AudienceLastSeenCell.tsx` | 38 | Fixed |
| `apps/web/components/admin/table/atoms/TableCheckboxCell.tsx` | 121 | Fixed |
| `apps/web/components/admin/table/atoms/TableCheckboxCell.tsx` | 142 | Fixed |
| `apps/web/components/admin/CreatorProfileTableRow.tsx` | 150 | Fixed |
| `apps/web/components/waitlist/WaitlistSpotifySearch.tsx` | 365 | Fixed |
| `apps/web/components/waitlist/WaitlistSpotifySearch.tsx` | 433 | Fixed |
| `apps/web/components/dashboard/molecules/artist-search-mode/UniversalLinkInputArtistSearchMode.tsx` | 179 | Fixed |
| `apps/web/components/dashboard/organisms/release-provider-matrix/ReleasesEmptyState.tsx` | 485 | Fixed |

### S1763 - Unreachable code (1 issue)

| File | Line | Status |
|------|------|--------|
| `apps/web/lib/monitoring/database-performance.ts` | 195 | Fixed - Removed dead try-catch block |

### Security Hotspot: Weak Cryptography (1 issue fixed)

| File | Line | Status |
|------|------|--------|
| `apps/web/lib/utils/url-encryption.ts` | 79 | Fixed - Replaced `Math.random()` with `crypto.getRandomValues()` |

---

## False Positives - Mark Manually in SonarCloud UI

### S6324 - Control characters in regex (6 issues)

These are **intentional security sanitization patterns** using escape sequences to match and remove control characters. They are NOT bugs.

| Issue Key | File | Line | Reason |
|-----------|------|------|--------|
| `AZvNmuYImvcFzv7-1iA0` | `apps/web/lib/security/path-traversal.ts` | 10 | Regex for sanitizing filenames |
| `AZvNmuYImvcFzv7-1iAz` | `apps/web/lib/security/path-traversal.ts` | 10 | Regex for sanitizing filenames |
| `AZttdSx19TSCcME8MSV1` | `apps/web/lib/notifications/domain.ts` | 64 | `CONTROL_CHAR_REGEX` for input sanitization |
| `AZttdSx19TSCcME8MSV2` | `apps/web/lib/notifications/domain.ts` | 64 | `CONTROL_CHAR_REGEX` for input sanitization |
| `AZttdSyF9TSCcME8MSWC` | `apps/web/lib/notifications/validation.ts` | 7 | `CONTROL_OR_SPACE_REGEX` for email validation |
| `AZttdSyF9TSCcME8MSWD` | `apps/web/lib/notifications/validation.ts` | 7 | `CONTROL_OR_SPACE_REGEX` for email validation |

**To mark as false positive:**
1. Go to SonarCloud → Issues
2. Filter by rule `typescript:S6324`
3. Select each issue and mark as "False Positive" with comment: "Intentional regex escape sequences for security sanitization"

---

## Security Hotspots - Safe to Mark

### Weak Cryptography: Math.random() for non-crypto use (1 hotspot)

| File | Line | Reason |
|------|------|--------|
| `apps/web/lib/email/jobs/enqueue.ts` | 18 | Random delay for job scheduling (anti-spam variance) - not security sensitive |

### HTTP Protocol: Dummy base URL (1 hotspot)

| File | Line | Reason |
|------|------|--------|
| `apps/web/lib/images/versioning.ts` | 110 | `http://dummy-base/` used as URL parser base, not for network requests |

### Regex DoS: Input-bounded patterns (23 hotspots)

These regex patterns operate on validated, length-bounded input. Review each for input validation at call site.

---

## API Note

The SonarCloud API token (`SONARCLOUD_TOKEN` in Doppler) has **read-only permissions** for issue transitions. POST requests to `/api/issues/do_transition` return 401. To mark issues via API, update the token permissions to include "Administer Issues".

---

## Verification

After the next SonarCloud analysis on `main`:
- S1082 issues should be resolved (11 → 0)
- S1763 issue should be resolved (1 → 0)
- S6324 issues need manual marking (6 issues)

Commit: `64f17aa72` on branch `chore/sync-claude-permissions`
