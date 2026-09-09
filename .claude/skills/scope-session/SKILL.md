---
name: scope-session
description: Turn an open-ended, incomplete prompt into a concrete, time-boxed MVP plan using a scoping checklist. Use right when the real take-home prompt arrives, during the 45-minute design conversation, or whenever the user wants help narrowing scope or deciding what to cut.
---

# Scope an open-ended prompt

This project is a 4-hour take-home with a 45-minute design conversation up
front. The prompt will be intentionally incomplete. The goal here is a
concrete, defensible MVP cut -- not full coverage of every possibility.

## Checklist to work through

1. **Who is the user and what's the core flow?** One sentence each. If the
   prompt describes multiple flows, identify which one is load-bearing.
2. **What's explicitly out of scope?** Say it out loud / write it down.
   Undiscussed scope is scope creep waiting to happen at hour 3.
3. **What data model assumptions are safe to make?** Note anything the
   prompt is ambiguous about, and the assumption being made instead of
   asking mid-build.
4. **How should errors/edge cases be handled, at a level of rigor that's
   actually achievable in 4 hours?** Don't over-engineer error handling for
   a v1.
5. **What does "done" mean for this session specifically?** Not "the whole
   product" -- the one vertical slice that will actually get finished.

## What to do with the answers

Once these are answered (with the interviewer, if this is the live design
call), write them straight into `CLAUDE.md`'s "Confirmed scope" section so
they persist for the rest of the session instead of living only in chat.

## Bias to state out loud

Prefer one thing that's fully done over three that are half-done. If the
prompt seems to invite an ambitious multi-feature build, proactively suggest
the smaller cut and ask whether that matches what they want to see, rather
than silently trying to do everything.
