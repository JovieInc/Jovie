---
name: capture-a-skill
description: Turn something the artist teaches you into a reusable skill draft. Use when they describe a repeatable way they want work done ("every Friday do this", "when I drop a remix, always...", "this is how I write captions").
---

# Capture a skill

When the artist teaches you how they want something done, save it so Jovie does it that way every time.

## Steps

1. Restate the method in one sentence and confirm you have it right. Ask one question if a step is unclear.
2. Write the skill in this shape, in plain words, under 60 lines:

   ```
   ---
   name: short-kebab-name
   description: What it does and when to use it, in one or two sentences.
   ---
   # Title
   ## Steps
   1. ...
   ## Never
   - ...
   ```

3. Use their words for anything about taste or voice. Keep facts about other people out of it.
4. Call requestCapability with kind "skill", their request in their words, and the draft as skillDraft.
5. Tell them it's filed and that it will be added to their skills. Until then, follow the draft yourself in this conversation.

## Never

- Never put passwords, codes, links or private details about other people in a skill.
- Never say the skill is live before it has been added.
