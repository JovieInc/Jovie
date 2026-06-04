---
type: idea
title: Jovie over iMessage — Future Product Feature
ingested_via: 'mcp:put_page'
ingested_at: '2026-05-31T19:18:39.397Z'
source_kind: 'mcp:put_page'
tags:
  - future
  - imessage
  - messaging
  - product
---

# Jovie over iMessage

**Status:** Future move — not now
**Who:** Tim White
**When:** When it makes sense in the product roadmap

## The Idea

Let users text Jovie like a contact over iMessage. Instead of opening an app or visiting a website, you just shoot a text to Jovie and she handles it — music business tasks, merch, distribution, whatever.

## Why It Matters

- iMessage is where people already are
- Frictionless — no app download, no login, just text
- Feels personal, like texting a friend who happens to run your music business
- Competitive moat — no other music business tool works this way

## How It Would Work

- Jovie gets a phone number (or uses Beeper's iMessage bridge)
- Users text Jovie like any contact
- Jovie responds in character — sharp, opinionated, artistically fluent
- Can handle: merch orders, distribution questions, royalty stuff, scheduling, whatever Tim's workflow covers

## Technical Path

- Beeper already bridges iMessage — could use that as the transport
- Would need a dedicated iMessage number/identity for Jovie
- Connects to the same Jovie agent backend as the web app
- Voice character already being built (JOV-2683)

## When to Build This

Not now. Ship the core product first. But when the time comes:
1. User research validates demand
2. Core Jovie web app is stable
3. Beeper integration is proven (we're already using it internally for Tim's inbox)
4. Founder bandwidth to oversee

## Related

- JOV-2683: Create Jovie character voice with ElevenLabs
- Tim's personal inbox auto-reply system (proof of concept for message-based Jovie interaction)
