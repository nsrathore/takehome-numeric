# Decision log

Jot these down AS YOU GO, not at the end — you won't remember the "why" in
4 hours, and this is exactly what the closing walkthrough will probe.

Template per entry:

## [HH:MM] Decision title

- **Context:** what prompted this decision
- **Options considered:** A vs B (vs C)
- **Chose:** X
- **Why:** the actual reasoning
- **Trade-off / what I gave up:**

---

## [00:00] Example entry — delete me

- **Context:** Needed to decide how to model X.
- **Options considered:** Normalize into two tables vs. a single JSON column.
- **Chose:** Two tables.
- **Why:** Queries need to filter on the nested field; JSON column would
  require app-side filtering at this data size.
- **Trade-off:** Slightly more migration boilerplate up front.

---

## [00:49] Fix Prisma CLI / client version mismatch in scaffold

- **Context:** During an initial walkthrough of the scaffold, `npm run db:generate` and `npm run db:push` both failed with `MODULE_NOT_FOUND` on `generator-build/index.js`. Root cause: `package.json` pinned `prisma` (CLI) to `^5.19.1` but `@prisma/client` to `^7.10.0` — Prisma 7's client dropped the legacy generator entrypoint the 5.x CLI expects. This would have broken `npm run setup` on any fresh clone and failed CI at the `db:generate` step.
- **Options considered:** (a) downgrade `@prisma/client` to `^5.19.1` to match the CLI vs. (b) upgrade the `prisma` CLI + schema to v7 (add generator `output`, verify `vitest-mock-extended` compatibility).
- **Chose:** (a) — downgrade `@prisma/client` to `^5.19.1`.
- **Why:** Smaller, lower-risk change; keeps the existing schema and code as-is and matches the rest of the v5-era scaffold conventions.
- **Trade-off / what I gave up:** Stuck on Prisma 5 instead of latest; would need to revisit if the take-home ends up needing a v7-only feature. Verified the fix with a real `npm install` + `db:generate` + `db:push` + typecheck + lint + test run — all green.

---

## [13:00] Lemonade stand data model (GameState/Day/Purchase) and pure-function demand design

- **Context:** The real prompt arrived as a full lemonade-stand simulation game (buy inventory → price → simulate a day → repeat until bankrupt), replacing the placeholder `Item` CRUD scaffold. Needed a data model that supports weighted-average cost-of-goods and a demand formula that's actually unit-testable.
- **Options considered:** (a) a single `GameState` row storing only current totals vs. (b) `GameState` (singleton) + `Day` (per-day history) + `Purchase` (per-purchase log); for demand, (a) generate randomness inside the function vs. (b) pass `randomFactor` in as an explicit argument.
- **Chose:** (b) for both — the three-table split, and `calculateDemand`/`calculateMaxSellable`/`isBankrupt` as pure functions that take all their inputs explicitly (including randomness).
- **Why:** Weighted-average COGS requires knowing the cost of each individual purchase, not just a running stock total, so `Purchase` rows are load-bearing, not just a nice-to-have log. Keeping `Math.random()` out of `calculateDemand` (call sites pass it in) and extracting `isBankrupt`/`calculateMaxSellable` as pure functions makes the core simulation rules deterministically testable without mocking Prisma or the RNG.
- **Trade-off / what I gave up:** `Day` and `Purchase` have no `gameId` foreign key, so history isn't scoped per game session — starting a new game (`POST /api/game`) has to explicitly wipe `Day`/`Purchase` rows to avoid overlapping `dayNumber`s from a prior run. Acceptable given the stated non-goal of persistence beyond a single local session.

---

## [13:25] Fix PRICE_ELASTICITY: "Run the day" was always returning zero demand

- **Context:** Bug report: every "Run the day" call returned Demand 0 / Sold 0 / Revenue $0 regardless of price or weather. Systematically ruled out the obvious coding-bug patterns first — no `|| 0` fallback, constants import correctly (verified with a throwaway script logging every intermediate value), `unitsDemanded` genuinely comes from `calculateDemand`'s return, `Math.random()` is called with parens. Isolated `calculateDemand(...)` directly and it returned a correct nonzero value. Pulled the real `/api/game/history` off the live dev server and found every price actually tried was $1 or higher.
- **Options considered:** (a) treat this as a UI/UX-only problem (add a price hint) and leave the constants alone vs. (b) fix the constants themselves, since the live nonzero-demand price window was a config defect, not the intended design.
- **Chose:** (b) — lowered `PRICE_ELASTICITY` from 1.2 to 0.5 in `gameConfig.ts`.
- **Why:** `priceMultiplier` clamps to exactly 0 once `price >= BASE_PRICE * (1 + 1/PRICE_ELASTICITY)`. At 1.2 that threshold was ~$0.92 — any price of $1+ (an entirely reasonable guess for a "price per cup" field) produced hard-zero demand every time, which is exactly what was reported. This wasn't a logic bug (the formula and its implementation matched spec exactly); it was a degenerate combination of two "arbitrary/tunable" constants that made the core game loop effectively unplayable at normal prices. Verified the fix live: $0.50 → demand 61, $1.00 → demand 21, $1.50 → demand 0 (new threshold, exactly as predicted), full buy→sell→profit loop confirmed working end-to-end.
- **Trade-off / what I gave up:** None functionally — this is exactly the kind of tuning adjustment the constants file already disclaims as arbitrary. Added a regression test asserting an *absolute* positive demand value at a realistic above-base price ($1), since the existing directional tests (`toBeGreaterThan`/`toBeLessThan`) never exercised a price outside the immediate BASE_PRICE neighborhood and so never caught how narrow the live window had become.

---

## [13:42] Cash double-counted COGS; suggestPrice uses grid search, not calculus

- **Context:** Confirmed hypothesis that `setPriceAndSimulateDay` computed `cashAtEnd = game.cash + profit`. `buyInventory` already deducts the full ingredient cost from cash the moment it's purchased, so adding `profit` (`revenue - cogs`) at day's end subtracted that same cost a second time — cash was silently running lower than it should. Separately, needed a `suggestPrice` function to recommend a profit-maximizing price for the day, given the same nonlinear, clamped `calculateDemand` formula.
- **Options considered:** For cash: (a) leave `cash += profit` and instead stop deducting cost at purchase time (accrual-style accounting) vs. (b) keep purchase-time deduction and change to `cash += revenue`. For price suggestion: (a) solve the profit-maximizing price in closed form via calculus on the demand formula vs. (b) a linear grid search evaluating `calculateDemand` at N candidate prices and taking the argmax.
- **Chose:** (b) for both — `cash += revenue` (profit stays a stored/reported field only); grid search over `priceMin..priceMax` in `steps` increments.
- **Why:** Cash: purchase-time deduction is the simpler mental model (cash reflects money actually spent/received as it happens) and matches how `buyInventory` already worked — changing the deduction timing would have meant no longer subtracting cost when you actually pay for ingredients, which is backwards. Price suggestion: `calculateDemand` includes a `clamp(...)` and a `Math.round(...)`, so it isn't smooth/differentiable — there's no clean closed-form optimum to solve for, and grid search reuses the exact same pure function the real simulation uses (no risk of the optimizer and the simulator disagreeing about what demand *is*), at the cost of only being an approximation at the grid's resolution.
- **Trade-off / what I gave up:** Grid search is $O(\text{steps})$ per call instead of $O(1)$, and its precision is bounded by `steps` (default 60 across a $0–$1.50 range ≈ 2.5¢ resolution) — acceptable for a UI suggestion button, not for anything latency-sensitive. Extracted `costPerCup(game)` and `maxSellableByInventory(inventory, recipe)` as standalone pure functions (previously inlined in `setPriceAndSimulateDay`) so both the real day-resolution path and `suggestPrice`'s route handler compute these identically from the same source.
