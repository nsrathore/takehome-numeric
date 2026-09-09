---
name: log-decision
description: Append a timestamped entry to NOTES.md in this repo's context/options/chose/why/trade-off format. Use immediately whenever you or the user make a nontrivial architecture, library, data-model, or scope decision during the take-home -- don't wait to be asked, and don't batch these up for later.
argument-hint: "[decision title]"
---

## Current time
!`date +%H:%M`

## Instructions

Append a new entry to the end of `NOTES.md` (create the file from its
existing template structure if it's somehow missing), using the time above
and this exact shape:

```
## [HH:MM] <decision title>

- **Context:** what prompted this decision
- **Options considered:** A vs B (vs C)
- **Chose:** X
- **Why:** the actual reasoning
- **Trade-off / what I gave up:**
```

Fill every field from what actually happened in this conversation — don't
invent options that weren't genuinely considered. If `$ARGUMENTS` gives a
title, use it; otherwise infer a short title from the decision just made.
Keep each field to 1-2 sentences. Do not ask the user to dictate the entry
to you if the reasoning is already visible in the conversation — write it
yourself and just confirm briefly what you logged.
