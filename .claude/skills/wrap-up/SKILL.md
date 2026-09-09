---
name: wrap-up
description: Run an end-of-session checklist before submitting the take-home -- verify tests pass, review commit history, and fill in README's Assumptions/What's-not-done sections. Use when the user says they're wrapping up, running low on time, or explicitly asks to prepare for submission.
disable-model-invocation: true
---

# End-of-session wrap-up

Work through these in order. Report the result of each rather than assuming
it passed.

1. **Verify it runs clean:**
   ```bash
   npm run lint && npm run typecheck && npm test
   ```
   Fix anything broken. Don't submit with known-failing checks unless you
   explicitly note why in the README.

2. **Review commit history:** `git log --oneline`. Confirm there's an actual
   trail of small, real commits with meaningful messages -- not one giant
   commit at the end. If it's the latter, it's too late to fix history, but
   flag it so the user isn't surprised in the walkthrough.

3. **Check the docs are current, not aspirational:**
   - `NOTES.md` reflects decisions actually made (use `log-decision` for
     anything missing).
   - `PROMPTS.md` reflects AI usage actually made (use `log-prompt` for
     anything missing).
   - `README.md`: fill in "Key decisions & trade-offs" (summarize NOTES.md),
     "Assumptions" (be specific), and "What's not done / what I'd do next"
     (be honest -- this is a positive signal in this interview, not a
     negative one, per the original prompt's grading criteria).

4. **Sanity-check the CLAUDE.md "Confirmed scope" section** still matches
   what was actually built -- update it if scope shifted mid-session.

5. **Final commit and stop.** Don't start new feature work once this
   checklist is running -- polish and documentation only.
