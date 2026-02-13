# Lyrics Auto-Format (Apple Music Guidelines)

## Overview

A one-click "Auto Format" button that reformats artist-submitted lyrics to comply with Apple Music's lyrics submission guidelines. This ensures lyrics pass DSP validation on first submission, reducing back-and-forth with distributors.

---

## Problem Statement

Currently:
1. Artists write lyrics in freeform text with inconsistent formatting
2. DSPs (especially Apple Music) have strict formatting rules that reject non-compliant submissions
3. Distributors reject lyrics uploads and send them back for reformatting, delaying releases
4. Common issues: wrong capitalization, missing section labels, incorrect line breaks, extra whitespace, punctuation inconsistencies
5. Artists lose time manually reformatting across multiple tracks per release

**Goal:** An "Auto Format" button that transforms raw lyrics into Apple Music-compliant format with one click, with a preview diff so artists can review changes before accepting.

---

## Apple Music Lyrics Guidelines (Summary)

Based on Apple's official guidelines for time-synced and static lyrics:

### Capitalization
- **Sentence case** throughout (capitalize first word of each line only)
- Song titles within lyrics: capitalize as the title appears
- Proper nouns: capitalize normally
- Do NOT use ALL CAPS for emphasis (even if the artist "screams" it)
- "I" is always capitalized

### Line Breaks & Structure
- One line per sung phrase (not per sentence — per breath/musical phrase)
- Blank line between sections (verse, chorus, bridge, etc.)
- Section labels are NOT included in the lyrics (no `[Verse 1]`, `[Chorus]`, etc.)
- No trailing whitespace on lines
- No leading whitespace on lines (no indentation)
- No more than one consecutive blank line

### Punctuation
- Use standard punctuation (periods, commas, question marks) at natural pauses
- Ellipsis: use `...` (three periods) not `…` (unicode ellipsis)
- Em-dash: use `—` (not `--`)
- No exclamation marks for emphasis (use sparingly, only for actual exclamations)
- Apostrophes: use standard `'` (not curly quotes)

### Content Rules
- Transliterate non-Latin scripts to Latin (if primary market is Latin-script)
- Ad-libs in parentheses: `(yeah)`, `(oh)`
- Background vocals in parentheses
- Profanity: include as-is (do not censor with asterisks)
- Spelling out vocal sounds: standardize (`ooh`, `ah`, `na`, `la`)

### Section Handling
- Remove section labels like `[Verse]`, `[Chorus]`, `[Bridge]`, `[Intro]`, `[Outro]`, `[Hook]`, `[Pre-Chorus]`, `[Interlude]`
- Preserve the blank line that separates sections
- Repeated choruses: include full lyrics each time (no "Repeat Chorus" shorthand)

---

## User Stories

- As an artist, I want to paste my lyrics and click "Auto Format" so they comply with Apple Music guidelines without manual reformatting
- As an artist, I want to preview the formatting changes before accepting them so I can verify nothing was incorrectly changed
- As an artist, I want to understand what was changed and why so I can learn the guidelines over time
- As an artist, I want to manually override specific formatting decisions if the auto-formatter got something wrong

---

## Feature Requirements

### 1. Auto Format Button

**Location:** Anywhere lyrics are edited in the dashboard:
- Release creation flow (per-track lyrics field)
- Track detail panel in the release sidebar
- Future: standalone lyrics editor

**UI:**
```
┌─────────────────────────────────────────────────────┐
│ Lyrics                                              │
│ ┌─────────────────────────────────────────────────┐ │
│ │ [VERSE 1]                                       │ │
│ │ Walking down the street at night                │ │
│ │ The neon signs are burning bright               │ │
│ │ I FEEL THE RHYTHM IN MY BONES                   │ │
│ │                                                 │ │
│ │ [CHORUS]                                        │ │
│ │ TAKE ME HIGHER...                               │ │
│ │ Set my soul on fire!!!                          │ │
│ │                                                 │ │
│ │ (Repeat Chorus)                                 │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ [Auto Format ✨]                        [Save]      │
└─────────────────────────────────────────────────────┘
```

### 2. Preview Diff

After clicking "Auto Format", show a side-by-side or inline diff:

```
┌─────────────────────────────────────────────────────┐
│ Formatting Preview                    [Apply] [Cancel]│
│                                                     │
│ 8 changes made:                                     │
│                                                     │
│ - Removed section label: [VERSE 1]           │
│ - Removed section label: [CHORUS]            │
│ - Fixed capitalization: 3 lines → sentence case     │
│ - Standardized punctuation: "..." → "..."           │
│ - Removed excess exclamation marks                  │
│ - Expanded "(Repeat Chorus)" to full lyrics         │
│ - Standardized curly quotes → straight quotes       │
│ - Removed trailing whitespace: 2 lines              │
│                                                     │
│ ┌───────────────────┬───────────────────────┐       │
│ │ Before            │ After                 │       │
│ ├───────────────────┼───────────────────────┤       │
│ │ [VERSE 1]         │                       │       │
│ │ Walking down the  │ Walking down the      │       │
│ │   street at night │ street at night       │       │
│ │ I FEEL THE RHYTHM │ I feel the rhythm     │       │
│ │   IN MY BONES     │ in my bones           │       │
│ │                   │                       │       │
│ │ [CHORUS]          │                       │       │
│ │ TAKE ME HIGHER... │ Take me higher...     │       │
│ │ Set my soul on    │ Set my soul on        │       │
│ │   fire!!!         │ fire!                 │       │
│ │                   │                       │       │
│ │ (Repeat Chorus)   │ Take me higher...     │       │
│ │                   │ Set my soul on fire!  │       │
│ └───────────────────┴───────────────────────┘       │
└─────────────────────────────────────────────────────┘
```

### 3. Formatting Rules Engine

A deterministic, rule-based formatter (no AI needed for v1):

| Rule ID | Rule | Input | Output |
|---------|------|-------|--------|
| `CAPS_001` | Sentence case conversion | `I FEEL THE RHYTHM` | `I feel the rhythm` |
| `CAPS_002` | Preserve "I" capitalization | `when i was young` | `When I was young` |
| `CAPS_003` | Preserve proper nouns | (requires known-word list) | (deferred to v2/AI) |
| `SECT_001` | Remove section labels | `[Verse 1]` | *(line removed)* |
| `SECT_002` | Normalize section gaps | 3+ blank lines | 1 blank line |
| `SECT_003` | Expand "Repeat" shorthand | `(Repeat Chorus)` | *(full chorus text)* |
| `WS_001` | Trim trailing whitespace | `line   ` | `line` |
| `WS_002` | Remove leading whitespace | `  indented` | `indented` |
| `WS_003` | Collapse multiple blanks | `\n\n\n` | `\n\n` |
| `PUNCT_001` | Normalize ellipsis | `…` | `...` |
| `PUNCT_002` | Normalize em-dash | `--` | `—` |
| `PUNCT_003` | Limit exclamation marks | `!!!` | `!` |
| `PUNCT_004` | Straighten curly quotes | `'` `'` `"` `"` | `'` `"` |
| `ADLIB_001` | Normalize ad-lib format | `(Yeah!)` | `(yeah)` |

### 4. Handling "(Repeat Chorus)" Expansion

This is the most complex rule:

1. During formatting, identify the first instance of a chorus section
2. Look for `(Repeat Chorus)`, `(Chorus)`, `(Chorus x2)`, `[Repeat Chorus]` patterns
3. Replace with the full chorus text
4. If chorus cannot be identified, leave a marker: `<!-- Could not auto-expand: please paste chorus lyrics here -->`
5. Show this as a warning in the diff preview

**Chorus detection heuristic:**
- Text between a `[Chorus]` label and the next `[Section]` label or double blank line
- If no section labels, skip expansion and warn

---

## Technical Design

### Formatter Module

```typescript
// apps/web/lib/lyrics/formatter.ts

export interface FormatResult {
  formatted: string;
  changes: FormatChange[];
  warnings: string[];
}

export interface FormatChange {
  ruleId: string;
  description: string;
  lineNumber?: number;
  before: string;
  after: string;
}

/**
 * Format lyrics according to Apple Music guidelines.
 * Pure function — no side effects, no DB access.
 */
export function formatLyrics(raw: string): FormatResult {
  const changes: FormatChange[] = [];
  const warnings: string[] = [];
  let lines = raw.split('\n');

  // Phase 1: Extract sections (for chorus expansion)
  const sections = extractSections(lines);

  // Phase 2: Apply rules in order
  lines = removeSectionLabels(lines, changes);
  lines = expandRepeatShorthand(lines, sections, changes, warnings);
  lines = applySentenceCase(lines, changes);
  lines = trimWhitespace(lines, changes);
  lines = normalizeBlankLines(lines, changes);
  lines = normalizePunctuation(lines, changes);
  lines = normalizeAdLibs(lines, changes);
  lines = straightenQuotes(lines, changes);

  return {
    formatted: lines.join('\n').trim(),
    changes,
    warnings,
  };
}
```

### React Component

```typescript
// apps/web/components/dashboard/molecules/LyricsAutoFormat.tsx

'use client';

import { useState, useCallback } from 'react';
import { formatLyrics, type FormatResult } from '@/lib/lyrics/formatter';
import { Button } from '@/components/atoms/Button';
import { Sparkles } from 'lucide-react';

interface LyricsAutoFormatProps {
  value: string;
  onChange: (value: string) => void;
}

export function LyricsAutoFormat({ value, onChange }: LyricsAutoFormatProps) {
  const [preview, setPreview] = useState<FormatResult | null>(null);

  const handleFormat = useCallback(() => {
    const result = formatLyrics(value);
    if (result.changes.length === 0) {
      // Already formatted — toast notification
      return;
    }
    setPreview(result);
  }, [value]);

  const handleApply = useCallback(() => {
    if (preview) {
      onChange(preview.formatted);
      setPreview(null);
    }
  }, [preview, onChange]);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleFormat}
        disabled={!value.trim()}
      >
        <Sparkles className="w-4 h-4 mr-1.5" />
        Auto Format
      </Button>

      {preview && (
        <LyricsFormatPreview
          result={preview}
          original={value}
          onApply={handleApply}
          onCancel={() => setPreview(null)}
        />
      )}
    </>
  );
}
```

### No Database Changes Required

This feature is entirely client-side for v1:
- The formatter is a pure function (input string → output string)
- No new tables or columns needed
- Lyrics are stored in whatever field they currently occupy (or the future lyrics field)
- The formatted output replaces the textarea value on "Apply"

### Future: AI-Enhanced Formatting (v2)

For v2, use the existing AI chat infrastructure to handle:
- Proper noun detection (city names, brand names, people)
- Contextual capitalization (e.g., song title references within lyrics)
- Intelligent chorus detection without section labels
- Language-specific rules (Spanish, French, etc.)
- Transliteration for non-Latin scripts

This would use the existing `aiDailyMessageLimit` and tool infrastructure.

---

## Edge Cases

### All Caps Lyrics
- Many artists write entirely in caps
- Sentence case conversion handles this, but warn if >80% of lines were all-caps:
  > "Most of your lyrics were in ALL CAPS. We've converted to sentence case per Apple Music guidelines. Review the preview to check proper nouns."

### No Section Labels
- If lyrics have no `[Section]` labels, skip section-related rules
- Still apply all other formatting rules
- "(Repeat Chorus)" expansion fails gracefully with a warning

### Mixed Languages
- v1: Apply English rules to all text
- v2: Detect language per section and apply language-specific rules
- Warning: "Mixed language detected. Auto-formatting applied English rules."

### Very Short Lyrics
- If lyrics are <3 lines, skip formatting (likely a fragment or note, not actual lyrics)

### Already Formatted
- If no changes are needed, show toast: "Lyrics already follow Apple Music guidelines"
- Don't show an empty diff

### Curly/Smart Quotes from Word Processors
- Common when artists copy from Word, Google Docs, or Notes
- Automatically straighten all curly quotes to standard ASCII

---

## Implementation Phases

### Phase 1: Core Formatter
1. Implement `formatLyrics()` pure function with all deterministic rules
2. Unit tests for each rule (high coverage — this is a pure function)
3. "Auto Format" button on lyrics textarea
4. Inline diff preview component

### Phase 2: Polish & Education
1. Format change summary with counts
2. Tooltips explaining each rule ("Why was this changed?")
3. Link to Apple Music lyrics guidelines documentation
4. Remember last format state (don't re-show preview on re-render)

### Phase 3: AI Enhancement (Future)
1. Proper noun detection via AI
2. Intelligent chorus detection without section labels
3. Language-specific formatting rules
4. Contextual decisions (when to use comma vs. period)

---

## Analytics Events

| Event | Properties | Trigger |
|-------|------------|---------|
| `lyrics_format_clicked` | `trackId`, `charCount` | Auto Format button clicked |
| `lyrics_format_applied` | `trackId`, `changeCount`, `rules` | User accepts formatting |
| `lyrics_format_cancelled` | `trackId`, `changeCount` | User cancels preview |
| `lyrics_already_formatted` | `trackId` | No changes needed |

---

## Files to Create/Modify

### New Files
```
apps/web/lib/lyrics/formatter.ts                    - Core formatting engine
apps/web/lib/lyrics/rules.ts                        - Individual formatting rules
apps/web/lib/lyrics/section-parser.ts               - Section label detection & chorus extraction
apps/web/lib/lyrics/__tests__/formatter.test.ts     - Unit tests
apps/web/components/dashboard/molecules/LyricsAutoFormat.tsx - Button + preview component
apps/web/components/dashboard/molecules/LyricsFormatPreview.tsx - Diff preview
```

### Modified Files
```
apps/web/components/organisms/release-sidebar/TrackDetailPanel.tsx - Add Auto Format button
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Auto Format adoption (% of lyrics submissions) | 40%+ |
| Format application rate (preview → apply) | 75%+ |
| DSP lyrics rejection rate (post-launch) | -60% |
| Average formatting changes per use | Track for guideline education |

---

## Dependencies

- No external dependencies for v1 (pure string manipulation)
- v2 AI features depend on existing AI chat infrastructure and `aiDailyMessageLimit`
- Lyrics storage field (if not yet implemented, this feature works with any text input)
