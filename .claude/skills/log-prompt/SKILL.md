---
name: log-prompt
description: Append an entry to PROMPTS.md documenting a significant AI prompt/tool use and what was kept or changed from the output. Use after any substantial AI-assisted code generation during the take-home -- the interviewers explicitly asked for this log, so don't wait to be asked and don't skip it for small trivial completions vs genuine generation.
argument-hint: "[what you asked for]"
---

## Current time
!`date +%H:%M`

## Instructions

Append a new entry to the end of `PROMPTS.md` using the time above and this
exact shape:

```
## [HH:MM] <what was asked for>

- **Tool:** Claude Code
- **Prompt:** (closely paraphrase the actual request, don't invent one)
- **What I kept / changed:** be specific -- "kept the function signature,
  rewrote the error handling" not "used it as a starting point"
```

Only log genuinely significant generation (a new feature, a nontrivial
refactor, a design/architecture suggestion) — not every single small edit or
one-line fix. When in doubt about whether something is worth logging, log it;
under-logging is the bigger risk here since it's an explicit deliverable.
