# AI usage log

They explicitly said prompts are part of what they want to see — log these
live, don't reconstruct them afterward from memory.

Template per entry:

## [HH:MM] What I asked for

- **Tool:** Claude / Copilot / etc.
- **Prompt:** (paste or closely paraphrase)
- **What I kept / changed:** did you use the output as-is, edit it, or
  discard it and do it yourself? Be specific — "kept the function signature,
  rewrote the error handling" is more useful than "used it as a starting point".

---

## [13:00] Scaffold the full lemonade-stand game feature from one detailed upfront prompt

- **Tool:** Claude Code
- **Prompt:** A single ~10-step spec covering: retiring the `Item` reference resource, the `GameState`/`Day`/`Purchase` Prisma schema (with exact field names/types), `gameConfig.ts` constants (recipe, base costs, starting cash, weather multipliers, bulk-discount tiers), the `gameService.ts` function list with algorithms spelled out step-by-step (`calculateDemand`'s exact formula, `buyInventory`'s weighted-average cost update, `setPriceAndSimulateDay`'s 10-step day-resolution sequence including the literal bankruptcy rule), the four API routes, a minimal UI page, and a specific list of test cases to cover.
- **What I kept / changed:** Kept essentially every explicit formula, field name, and function signature as given (e.g. `calculateDemand`'s clamp math, the weighted-average cost formula, the bankruptcy condition). Filled in gaps the prompt left implicit: added a `GameError` class so routes can map business-rule failures (insufficient cash, playing after game-over) to 400s the same way `ZodError` maps to 400 elsewhere; extracted `calculateMaxSellable`/`isBankrupt` as separate pure functions (only `calculateDemand` was explicitly required to be pure) so the bankruptcy rule and inventory-cap logic could be unit-tested directly instead of only through the full Prisma-mocked flow; decided `resetGame()` (used by `POST /api/game`) clears `Day`/`Purchase` history since those tables have no `gameId` link back to `GameState`, while `getOrCreateGame()`'s auto-reset-on-game-over path leaves history alone since it's a read-triggered side effect, not an explicit "new game" action.
